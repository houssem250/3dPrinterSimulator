/**
 * @file MqttService.js
 * @description Listens to OctoPrint MQTT topics and feeds the StreamProvider.
 * 
 * It maintain a local state to merge fragmented data (temp, motion, progress)
 * into unified frames for the Digital Shadow.
 */

import { PRINTER_CONFIG } from '../../config/printer_config.js';
import { AppContext } from '../../app_context.js';

export class MqttService {
  constructor() {
    this.client = null;
    this.isConnected = false;

    /** 
     * Map of printer instances.
     * Key: printerId
     * Value: { stream, topicPrefix, localState }
     */
    this.instances = new Map();
  }

  /**
   * Registers a printer instance to receive MQTT data.
   * @param {number|string} id 
   * @param {import('../providers/StreamProvider.js').StreamProvider} stream 
   * @param {string} topicPrefix e.g. "octoprint/" or "printer1/"
   */
  registerPrinter(id, stream, topicPrefix) {
    this.instances.set(id, {
      stream,
      topicPrefix,
      localState: {
        x: 0, y: 0, z: 0, e: 0, f: 0,
        temp: { nozzle: 0, bed: 0 },
        progress: 0,
        cmdIndex: undefined,
        isExtruding: false
      }
    });

    // If already connected, subscribe to the new prefix
    if (this.isConnected && this.client) {
      this.client.subscribe(`${topicPrefix}#`);
    }
  }

  /**
   * Connects to the Mosquitto broker via WebSockets.
   */
  async connect() {
    if (this.client) return;

    console.log(`🔌 MQTT: Connecting to ${PRINTER_CONFIG.MQTT.BROKER_URL}...`);

    try {
      const mqttModule = await import('https://esm.sh/mqtt');
      const connect = mqttModule.connect || mqttModule.default?.connect;

      if (typeof connect !== 'function') throw new Error('Could not find connect() in MQTT module');

      this.client = connect(PRINTER_CONFIG.MQTT.BROKER_URL);

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('✅ MQTT: Connected to broker.');

        // Subscribe to all registered printer prefixes
        for (const inst of this.instances.values()) {
          this.client.subscribe(`${inst.topicPrefix}#`);
        }
        
        // Also subscribe to legacy defaults if any
        if (this.instances.size === 0) {
           this.client.subscribe('octoprint/#');
        }
      });

      this.client.on('message', (topic, message) => {
        this._handleMessage(topic, message.toString());
      });

      this.client.on('error', (err) => console.error('❌ MQTT Error:', err));

    } catch (err) {
      console.error('❌ MQTT Initialization Failed:', err);
    }
  }

  /**
   * Routes incoming JSON into the correct Digital Shadow instance.
   * @private
   */
  _handleMessage(topic, payload) {
    // 1. Find which machine this topic belongs to
    let target = null;

    for (const inst of this.instances.values()) {
      if (topic.startsWith(inst.topicPrefix)) {
        target = inst;
        break;
      }
    }

    // Fallback for single-printer legacy setups (no prefix matched)
    if (!target && this.instances.size === 1) {
      target = Array.from(this.instances.values())[0];
    }

    if (!target) return;

    let data;
    try {
      data = JSON.parse(payload);
    } catch (e) { return; }

    const { localState, stream, topicPrefix } = target;
    let isMotion = false;

    // 2. Decode Topic
    const subTopic = topic.replace(topicPrefix, '');

    // Motion
    if (subTopic === 'motion' || topic === PRINTER_CONFIG.MQTT.TOPICS.MOTION) {
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
      isMotion = true;
    }

    // Temperature
    if (subTopic.includes('temperature/tool0')) {
      localState.temp.nozzle = data.actual ?? localState.temp.nozzle;
    }
    if (subTopic.includes('temperature/bed')) {
      localState.temp.bed = data.actual ?? localState.temp.bed;
    }

    // Progress
    if (subTopic === 'progress/printing') {
      localState.progress = data.progress ?? localState.progress;
    }

    // 3. Push to Instance Stream
    if (isMotion && stream) {
      stream.push({
        pos: { x: localState.x, y: localState.y, z: localState.z, e: localState.e },
        temp: { ...localState.temp },
        feedrate: localState.f,
        progress: localState.progress,
        cmdIndex: localState.cmdIndex,
        is_extruding: localState.isExtruding,
        timestamp: Date.now()
      });
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.isConnected = false;
    }
  }
}

// Export as singleton
export const mqttService = new MqttService();
