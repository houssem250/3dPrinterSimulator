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

    // We maintain a local "merged" state so that if temperature arrives 
    // without motion, or vice versa, the StreamProvider gets a complete update.
    this.localState = {
      x: 0, y: 0, z: 0, e: 0, f: 0,
      temp: { nozzle: 0, bed: 0 },
      progress: 0,
      cmdIndex: undefined,
      isExtruding: false
    };
  }

  /**
   * Connects to the Mosquitto broker via WebSockets.
   */
  async connect() {
    if (this.client) return;

    console.log(`🔌 MQTT: Connecting to ${PRINTER_CONFIG.MQTT.BROKER_URL}...`);

    try {
      // Dynamic import from CDN
      const mqttModule = await import('https://esm.sh/mqtt');
      // Look for connect in named exports or default export
      const connect = mqttModule.connect || mqttModule.default?.connect;

      if (typeof connect !== 'function') {
        throw new Error('Could not find connect() in MQTT module');
      }

      this.client = connect(PRINTER_CONFIG.MQTT.BROKER_URL);

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('✅ MQTT: Connected to broker.');

        // Subscribe to all configured topics
        const topics = Object.values(PRINTER_CONFIG.MQTT.TOPICS);
        this.client.subscribe(topics, (err) => {
          if (!err) console.log(`📡 MQTT: Subscribed to ${topics.join(', ')}`);
        });
      });

      this.client.on('message', (topic, message) => {
        this._handleMessage(topic, message.toString());
      });

      this.client.on('error', (err) => {
        console.error('❌ MQTT Error:', err);
      });

    } catch (err) {
      console.error('❌ MQTT Initialization Failed:', err);
    }
  }

  /**
   * Translates incoming JSON into Digital Shadow frames.
   * @private
   */
  _handleMessage(topic, payload) {
    let data;
    try {
      data = JSON.parse(payload);
    } catch (e) { return; }

    let isMotion = false;

    // 1. Motion Topic (Mapping from OctoPrint plugin)
    if (topic === PRINTER_CONFIG.MQTT.TOPICS.MOTION) {
      // Only recalculate extrusion if E data is present, otherwise retain previous state
      if (data.e !== undefined || data.is_extruding !== undefined) {
        const eDelta = data.e !== undefined ? (data.e - this.localState.e) : 0;
        this.localState.isExtruding = data.is_extruding ?? (eDelta > 0.001);
      }

      this.localState.x = data.x ?? this.localState.x;
      this.localState.y = data.y ?? this.localState.y;
      this.localState.z = data.z ?? this.localState.z;
      this.localState.e = data.e ?? this.localState.e;
      this.localState.f = data.f ?? this.localState.f;
      this.localState.cmdIndex = data.cmdIndex; 
      
      isMotion = true;
    }

    // 2. Temperature Topics (Passive update)
    if (topic.includes('temperature/tool0')) {
      this.localState.temp.nozzle = data.actual ?? this.localState.temp.nozzle;
    }
    if (topic.includes('temperature/bed')) {
      this.localState.temp.bed = data.actual ?? this.localState.temp.bed;
    }

    // 3. Progress Topic (Passive update)
    if (topic === PRINTER_CONFIG.MQTT.TOPICS.PROGRESS) {
      this.localState.progress = data.progress ?? this.localState.progress;
    }

    // Only push to simulation if we have MOTION 
    // This prevents the head from snapping to (0,0,0) during temp updates.
    if (isMotion && AppContext.stream) {
      AppContext.stream.push({
        pos: {
          x: this.localState.x,
          y: this.localState.y,
          z: this.localState.z,
          e: this.localState.e
        },
        temp: { ...this.localState.temp },
        feedrate: this.localState.f,
        progress: this.localState.progress,
        cmdIndex: this.localState.cmdIndex,
        is_extruding: this.localState.isExtruding,
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
