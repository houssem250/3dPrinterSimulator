/**
 * @file MqttService.js
 * @description Listens to OctoPrint MQTT topics and feeds the StreamProvider.
 * Also handles raw sensor topics: sensor/esp8266/imu and sensor/filament/flow.
 *
 * Supports multiple concurrent MQTT connections to allow different printers 
 * in the fleet to connect to different OctoPrint instances.
 */

import { PRINTER_CONFIG } from '../../config/printer_config.js';
import { useFleetStore } from '../store/useFleetStore.js';

export class MqttService {
  constructor() {
    /** 
     * Map of active MQTT clients.
     * Key: brokerUrl (string)
     * Value: MQTT Client instance
     */
    this.clients = new Map();

    /** 
     * Map of printer instances.
     * Key: printerId
     * Value: { stream, topicPrefix, localState, brokerUrl }
     */
    this.instances = new Map();

    // ── Sensor data aggregation ──────────────────────────────────────────────
    // Vibration: accumulate raw IMU packets into a 1-second tumbling window.
    // Every second we compute mean + peak and push ONE aggregated point.
    // This cuts 70 store updates/sec down to 1, saving significant React renders.
    this.vibWindow = [];       // raw magnitude samples in current 1s window
    this.vibWindowAccZ = [];   // acc_z samples for baseline reference
    this.vibWindowTime = Date.now();

    // Flow: still batched (packets arrive at ~2Hz already)
    this.flowBuffer = [];
    this.batchInterval = null;
  }

  /**
   * Registers a printer instance to receive MQTT data from a specific broker.
   * @param {number|string} id 
   * @param {import('../providers/StreamProvider.js').StreamProvider} stream 
   * @param {string} topicPrefix e.g. "octoprint/" or "printer1/"
   * @param {string} [brokerUrl] Optional default broker URL
   */
  registerPrinter(id, stream, topicPrefix, brokerUrl = PRINTER_CONFIG.MQTT.BROKER_URL) {
    this.instances.set(id, {
      stream,
      topicPrefix,
      brokerUrl,
      localState: {
        x: 0, y: 0, z: 0, e: 0, f: 0,
        temp: { nozzle: 0, bed: 0, nozzleTarget: 0, bedTarget: 0 },
        progress: 0,
        cmdIndex: undefined,
        isExtruding: false,
        isPrinting: false,
        isPaused: false,
        state: 'IDLE',
        layer: 0,
        layers: 0,
        hasRealLayers: false,
        timeElapsed: 0,
        timeLeft: 0
      }
    });

    // If client for this broker is already connected, subscribe to the new prefix
    const client = this.clients.get(brokerUrl);
    if (client && client.connected) {
      client.subscribe(`${topicPrefix}#`);
    }
  }

  /**
   * Connects to a specific Mosquitto broker via WebSockets.
   * @param {string} [overrideUrl] Optional broker URL (e.g. ws://192.168.1.42:9001)
   */
  async connect(overrideUrl = null) {
    const brokerUrl = overrideUrl || PRINTER_CONFIG.MQTT.BROKER_URL;

    // Start the 1-second sensor flush interval
    if (!this.batchInterval) {
      this.vibWindowTime = Date.now();
      this.batchInterval = setInterval(() => {
        this._flushSensorBuffers();
      }, 1000);
    }

    if (this.clients.has(brokerUrl)) {
      console.log(`ℹ️ MQTT: Already connected/connecting to ${brokerUrl}`);
      return;
    }

    console.log(`🔌 MQTT: Connecting to ${brokerUrl}...`);

    try {
      const mqttModule = await import('https://esm.sh/mqtt');
      const connect = mqttModule.connect || mqttModule.default?.connect;

      if (typeof connect !== 'function') throw new Error('Could not find connect() in MQTT module');

      const client = connect(brokerUrl);
      this.clients.set(brokerUrl, client);

      client.on('connect', () => {
        console.log(`✅ MQTT: Connected to broker at ${brokerUrl}.`);

        // Subscribe to all printers registered to THIS broker
        for (const inst of this.instances.values()) {
          if (inst.brokerUrl === brokerUrl) {
            client.subscribe(`${inst.topicPrefix}#`);
          }
        }

        // Always subscribe to raw sensor topics (shared across all printers on this broker)
        client.subscribe('sensor/#');

        // Legacy fallback
        if (this.instances.size === 0 && brokerUrl === PRINTER_CONFIG.MQTT.BROKER_URL) {
          client.subscribe('octoprint/#');
        }
      });

      client.on('message', (topic, message) => {
        this._handleMessage(brokerUrl, topic, message.toString());
      });

      client.on('error', (err) => {
        console.error(`❌ MQTT Error [${brokerUrl}]:`, err);
      });

      client.on('close', () => {
        console.warn(`⚠️ MQTT Connection closed: ${brokerUrl}`);
      });

    } catch (err) {
      console.error(`❌ MQTT Initialization Failed [${brokerUrl}]:`, err);
    }
  }

  /**
   * Routes incoming JSON into the correct Digital Shadow instance.
   * Also handles raw sensor topics (sensor/esp8266/imu, sensor/filament/flow)
   * by pushing directly to the Zustand store's updateSensorHistory.
   * @private
   */
  _handleMessage(brokerUrl, topic, payload) {
    const topicLower = topic.toLowerCase();

    let data;
    try {
      data = JSON.parse(payload);
      if (!data || typeof data !== 'object') return;
    } catch (e) { return; }

    // ── Sensor topics (sensor/#) ─────────────────────────────────────────────
    // These are board-level streams, not per-printer-prefix. We associate them
    // to ALL printers registered on this broker (typically just one).
    if (topicLower === 'sensor/esp8266/imu') {
      const dx = data.delta_acc_x ?? 0;
      const dy = data.delta_acc_y ?? 0;
      const dz = data.delta_acc_z ?? 0;
      // Use full 3-axis magnitude
      const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.vibWindow.push(magnitude);
      this.vibWindowAccZ.push(data.acc_z ?? 0);
      return;
    }

    if (topicLower === 'sensor/filament/flow') {
      const flowPoint = {
        time: Date.now(),
        flow_mm_s: data.flow_mm_s ?? 0,
        counts: data.counts ?? 0,
      };
      this.flowBuffer.push(flowPoint);
      return;
    }


    if (topicLower === 'sensor/esp8266/temperature') {
      const heatsinkTemp = data.temp_c ?? 0;
      const { updateHeatsink, printers } = useFleetStore.getState();
      for (const id of Object.keys(printers)) {
        updateHeatsink(id, heatsinkTemp);
      }
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Find machine(s) belonging to this broker and prefix
    let targets = [];
    for (const [id, inst] of this.instances.entries()) {
      if (inst.brokerUrl === brokerUrl && topicLower.startsWith(inst.topicPrefix.toLowerCase())) {
        targets.push(inst);
      }
    }

    // Fallback for single-printer legacy setups on this broker
    if (targets.length === 0) {
      const brokerPrinters = Array.from(this.instances.values()).filter(i => i.brokerUrl === brokerUrl);
      if (brokerPrinters.length === 1) targets = [brokerPrinters[0]];
    }

    if (targets.length === 0) return;

    targets.forEach(target => {
      const { localState, stream, topicPrefix } = target;
      let hasUpdate = false;

      // Decode Topic relative to prefix (robust slash handling)
      const cleanPrefix = topicPrefix.toLowerCase().replace(/\/+$/, '');
      const subTopic = topicLower.replace(cleanPrefix, '').replace(/^\/+/, '');

      // State Capture (Attribute Agnostic - catches it from any packet)
      if (data.state !== undefined && data.state !== null) {
        let stateStr = '';
        if (typeof data.state === 'string') {
          stateStr = data.state;
        } else if (typeof data.state === 'object') {
          if (typeof data.state.text === 'string') {
            stateStr = data.state.text;
          } else if (data.state.text !== undefined && data.state.text !== null) {
            stateStr = String(data.state.text);
          }

          // Handle standard OctoPrint state flags if present
          if (data.state.flags && typeof data.state.flags === 'object') {
            const flags = data.state.flags;
            if (flags.printing !== undefined) {
              const newIsPrinting = !!flags.printing;
              if (newIsPrinting !== localState.isPrinting) {
                localState.isPrinting = newIsPrinting;
                if (newIsPrinting) {
                  localState.state = localState.isPaused ? "PAUSED" : "PRINTING";
                } else if (!["PRINTDONE", "PRINTCANCELLED", "PRINTFAILED"].includes(localState.state)) {
                  localState.state = "IDLE";
                }
              }
              hasUpdate = true;
            }
            if (flags.paused !== undefined) {
              const newIsPaused = !!flags.paused;
              if (newIsPaused !== localState.isPaused) {
                localState.isPaused = newIsPaused;
                if (localState.isPrinting) {
                  localState.state = newIsPaused ? "PAUSED" : "PRINTING";
                }
              }
              hasUpdate = true;
            }
          }
        } else {
          stateStr = String(data.state);
        }

        if (stateStr) {
          localState.state = stateStr.toUpperCase();
          hasUpdate = true;
        }
      }
      if (data.is_printing !== undefined || data.isPrinting !== undefined) {
        const newIsPrinting = data.is_printing ?? data.isPrinting;
        if (newIsPrinting !== localState.isPrinting) {
           localState.isPrinting = newIsPrinting;
           if (newIsPrinting) {
             localState.state = localState.isPaused ? "PAUSED" : "PRINTING";
           } else if (!["PRINTDONE", "PRINTCANCELLED", "PRINTFAILED"].includes(localState.state)) {
             localState.state = "IDLE";
           }
        }
        hasUpdate = true;
      }
      if (data.is_paused !== undefined || data.isPaused !== undefined) {
        const newIsPaused = data.is_paused ?? data.isPaused;
        if (newIsPaused !== localState.isPaused) {
           localState.isPaused = newIsPaused;
           if (localState.isPrinting) {
             localState.state = newIsPaused ? "PAUSED" : "PRINTING";
           }
        }
        hasUpdate = true;
      }

      // Motion
      if (subTopic === 'motion' || topicLower === PRINTER_CONFIG.MQTT.TOPICS.MOTION?.toLowerCase()) {
        if (data.e !== undefined || data.is_extruding !== undefined) {
          const eDelta = data.e !== undefined ? (data.e - localState.e) : 0;
          localState.isExtruding = data.is_extruding ?? (eDelta > 0.001);
        }

        localState.x = data.x ?? localState.x;
        localState.y = data.y ?? localState.y;
        localState.z = data.z ?? localState.z;
        localState.e = data.e ?? localState.e;
        localState.f = data.f ?? localState.f;
        localState.cmdIndex = data.cmdIndex;

        // Shadow Layer Estimation (Assuming 0.2mm layers) - Fallback ONLY
        if (!localState.hasRealLayers && localState.z > 0) {
          localState.layer = Math.floor(localState.z / 0.2) + 1;
        }

        hasUpdate = true;
      }

      // Unified Temperature (from new plugin)
      if (subTopic === 'temperature') {
        const t = data.temp || data;
        localState.temp.nozzle = t.nozzle ?? localState.temp.nozzle;
        localState.temp.nozzleTarget = t.nozzleTarget ?? localState.temp.nozzleTarget;
        localState.temp.bed = t.bed ?? localState.temp.bed;
        localState.temp.bedTarget = t.bedTarget ?? localState.temp.bedTarget;
        hasUpdate = true;
      }

      // Legacy/Standard Temperature
      if (subTopic.includes('temperature/tool0')) {
        localState.temp.nozzle = data.actual ?? localState.temp.nozzle;
        localState.temp.nozzleTarget = data.target ?? localState.temp.nozzleTarget;
        hasUpdate = true;
      }
      if (subTopic.includes('temperature/bed')) {
        localState.temp.bed = data.actual ?? localState.temp.bed;
        localState.temp.bedTarget = data.target ?? localState.temp.bedTarget;
        hasUpdate = true;
      }

      // Progress and State
      if (subTopic === 'progress/printing') {
        localState.progress = data.progress ?? localState.progress;
        localState.timeElapsed = data.time_elapsed ?? localState.timeElapsed;
        localState.timeLeft = data.time_left ?? localState.timeLeft;
        hasUpdate = true;
      }

      // OctoPrint Event & Plugin Layer syncing
      if (subTopic.includes('event/displaylayerprogress_layerchanged')) {
        localState.layer = data.currentLayer ?? data.current ?? localState.layer;
        localState.layers = data.totalLayerCount ?? data.total ?? localState.layers;
        localState.hasRealLayers = true;
        hasUpdate = true;
      }
      if (subTopic.includes('plugins/displaylayerprogress/values')) {
        const layerInfo = data.layer || {};
        localState.layer = layerInfo.current ?? localState.layer;
        localState.layers = layerInfo.total ?? localState.layers;
        localState.hasRealLayers = true;
        hasUpdate = true;
      }
      if (subTopic.includes('event/printpaused'))   { localState.isPaused = true;  localState.state = 'PAUSED';   hasUpdate = true; }
      if (subTopic.includes('event/printresumed'))  { localState.isPaused = false; localState.state = 'PRINTING'; hasUpdate = true; }
      // NOTE: PrintStarted → set state to PRINTING (not PRINTSTARTED) so the timeline picks it up
      if (subTopic.includes('event/printstarted'))  {
        localState.isPrinting = true;
        localState.isPaused = false;
        localState.state = 'PRINTING';
        hasUpdate = true;
      }
      if (subTopic.includes('event/printcancelled')) {
        localState.isPrinting = false;
        localState.isPaused = false;
        localState.state = "PRINTCANCELLED";
        hasUpdate = true;
      }
      if (subTopic.includes('event/printdone')) {
        localState.isPrinting = false;
        localState.isPaused = false;
        localState.state = "PRINTDONE";
        hasUpdate = true;
      }

      // Generic printer state
      if (subTopic === 'printer/state') {
        const state = (data.state_id || "").toLowerCase();
        localState.state = state.toUpperCase();
        if (state === 'printing') { 
          localState.isPrinting = true; 
          localState.isPaused = false; 
        } else if (state === 'paused') { 
          localState.isPrinting = true; 
          localState.isPaused = true; 
        } else if (state === 'operational' || state === 'idle') {
          if (localState.progress === 0 || localState.progress === 100) {
            localState.isPrinting = false;
            localState.isPaused = false;
          }
        } else {
          localState.isPrinting = false;
          localState.isPaused = false;
        }
        hasUpdate = true;
      }

      // Push to Instance Stream
      if (hasUpdate && stream) {
        stream.push({
          pos: { x: localState.x, y: localState.y, z: localState.z, e: localState.e },
          temp: { ...localState.temp },
          feedrate: localState.f,
          progress: localState.progress,
          cmdIndex: localState.cmdIndex,
          is_extruding: localState.isExtruding,
          isPrinting: localState.isPrinting,
          isPaused: localState.isPaused,
          state: localState.state || 'IDLE',
          layer: localState.layer,
          layers: localState.layers,
          timeElapsed: localState.timeElapsed,
          timeLeft: localState.timeLeft,
          timestamp: Date.now()
        });
      }
    });
  }

  disconnect(brokerUrl = null) {
    if (brokerUrl) {
      // Check if any OTHER printer is still using this broker
      const otherUsers = Array.from(this.instances.values()).some(inst =>
        inst.brokerUrl === brokerUrl && inst.stream && inst.stream.isRunning
      );

      if (!otherUsers) {
        const client = this.clients.get(brokerUrl);
        if (client) {
          console.log(`🔌 MQTT: Closing connection to ${brokerUrl} (No active printers)`);
          client.end();
          this.clients.delete(brokerUrl);
        }
      }
    } else {
      // Disconnect all
      for (const client of this.clients.values()) {
        client.end();
      }
      this.clients.clear();
    }
  }

  /**
   * Publishes a message to the active MQTT broker client.
   * @param {string} topic 
   * @param {object|string} payload 
   */
  publish(topic, payload) {
    const brokerUrl = PRINTER_CONFIG.MQTT.BROKER_URL;
    const client = this.clients.get(brokerUrl);
    if (client && client.connected) {
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      client.publish(topic, payloadStr);
    }
  }

  /**
   * Flushes aggregated vibration window + flow buffer to the Zustand store.
   *
   * IMU: every 1 second, collapse all accumulated raw magnitude samples into
   * a single { mean, peak, acc_z } data point. This is dramatically more
   * meaningful than storing raw noise at 70Hz, and avoids render thrashing.
   *
   * Flow: still flushed per-packet (low-frequency 2Hz).
   * @private
   */
  _flushSensorBuffers() {
    const { batchUpdateSensorHistory } = useFleetStore.getState();

    // ── Vibration: collapse 1s window ────────────────────────────────────────
    let vibPoints = [];
    if (this.vibWindow.length > 0) {
      const mags = this.vibWindow;
      const mean = mags.reduce((s, v) => s + v, 0) / mags.length;
      const peak = Math.max(...mags);
      const avgAccZ = this.vibWindowAccZ.length > 0
        ? this.vibWindowAccZ.reduce((s, v) => s + v, 0) / this.vibWindowAccZ.length
        : 0;

      vibPoints = [{
        time: Date.now(),
        magnitude: mean,  // mean magnitude for smooth trend
        peak,             // peak magnitude for anomaly detection
        acc_z: avgAccZ,
        sampleCount: mags.length
      }];

      this.vibWindow = [];
      this.vibWindowAccZ = [];
    }

    // ── Flow: flush accumulated packets ──────────────────────────────────────
    const flowPoints = this.flowBuffer.length > 0 ? [...this.flowBuffer] : [];
    this.flowBuffer = [];

    if (vibPoints.length > 0 || flowPoints.length > 0) {
      batchUpdateSensorHistory(vibPoints, flowPoints);
    }
  }
}

// Export as singleton
export const mqttService = new MqttService();
