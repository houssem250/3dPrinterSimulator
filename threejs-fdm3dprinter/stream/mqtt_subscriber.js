/**
 * @file mqtt_subscriber.js
 * @description MQTT subscriber for receiving real-time printer state updates.
 *
 * This module handles:
 * - Connection to MQTT broker
 * - Topic subscription
 * - Message parsing into normalized PrinterState format
 * - Event emission for state updates
 *
 * Expected message format from broker:
 * {
 *   position: { x: number, y: number, z: number, e: number },
 *   status: { is_extruding: boolean, is_printing: boolean },
 *   temperature: { nozzle: number, bed: number },
 * }
 *
 * @module stream/mqtt_subscriber
 */

import { MQTT_CONFIG, getConnectionOptions, getTopicsToSubscribe } from './mqtt_config.js';

let mqtt = null;

async function getMqttLib() {
  if (mqtt) {
    return mqtt;
  }

  try {
    const loaded = await import('mqtt');
    mqtt = loaded.default ?? loaded;

    // If `mqtt.connect` is missing, try to resolve from default object
    if (typeof mqtt.connect !== 'function' && mqtt.default && typeof mqtt.default.connect === 'function') {
      mqtt = mqtt.default;
    }

    return mqtt;
  } catch (err) {
    console.warn('MQTT library not available, using mock implementation', err);
    mqtt = null;
    return null;
  }
}

export class MQTTSubscriber {
  /**
   * @param {object} [options] Optional configuration overrides
   */
  constructor(options = {}) {
    this.config = { ...MQTT_CONFIG, ...options };
    this.client = null;
    this.isConnected = false;
    this.latestState = {
      position: { x: 0, y: 0, z: 0, e: 0 },
      status: { is_extruding: false, is_printing: false },
      temperature: { nozzle: 0, bed: 0 },
    };
    this.listeners = {
      stateUpdate: [],
      error: [],
      connected: [],
      disconnected: [],
    };
  }

  /**
   * Connect to MQTT broker
   * @returns {Promise<void>}
   * @throws {Error} If connection fails
   */
  async connect() {
    const mqttLib = await getMqttLib();
    if (!mqttLib) {
      // Mock connection for development/testing
      console.log('MQTT subscriber connected (mock - MQTT library not available)');
      this.isConnected = true;
      this._emit('connected');
      return;
    }

    const connectFn = mqttLib.connect || (mqttLib.default && mqttLib.default.connect);
    if (typeof connectFn !== 'function') {
      console.warn('mqtt.connect not found, using mock mode');
      this.isConnected = true;
      this._emit('connected');
      return;
    }

    try {
      this.client = connectFn(
        this.config.connection.url,
        getConnectionOptions()
      );

      // Setup event handlers
      this.client.on('connect', () => this._handleConnect());
      this.client.on('message', (topic, payload) => this._handleMessage(topic, payload));
      this.client.on('error', (err) => this._handleError(err));
      this.client.on('disconnect', () => this._handleDisconnect());

      // Wait for connection
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MQTT connection timeout'));
        }, this.config.connection.connectTimeout);

        this.client.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.client.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } catch (err) {
      this._emit('error', err);
      throw err;
    }
  }

  /**
   * Subscribe to MQTT topics
   * @returns {Promise<void>}
   * @throws {Error} If not connected or subscription fails
   */
  async subscribe() {
    if (!this.isConnected) {
      throw new Error('MQTT client not connected. Call connect() first.');
    }

    if (!mqtt) {
      // Mock subscription
      const topics = getTopicsToSubscribe();
      console.log(`Subscribed to topics: ${topics.join(', ')} (mock)`);
      return;
    }

    const topics = getTopicsToSubscribe();
    return new Promise((resolve, reject) => {
      this.client.subscribe(topics, (err) => {
        if (err) {
          this._emit('error', err);
          reject(err);
        } else {
          console.log(`Subscribed to topics: ${topics.join(', ')}`);
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming MQTT message
   * Parses JSON and emits normalized state update
   * @param {string} topic Topic name
   * @param {Buffer|string} payload Message payload
   * @private
   */
  _handleMessage(topic, payload) {
    try {
      const payloadStr = typeof payload === 'string' ? payload : payload.toString();
      let data;
      try {
        data = JSON.parse(payloadStr);
      } catch (err) {
        // attempt to recover from single-quotes JSON style by replacing quotes
        const normalized = payloadStr.replace(/'/g, '"');
        data = JSON.parse(normalized);
      }

      console.debug('[MQTT] message', topic, data);
      const state = this._normalizeState(topic, data);
      console.debug('[MQTT] normalized state', state);
      this._emit('stateUpdate', state);
    } catch (err) {
      this._emit('error', new Error(`Failed to parse message from ${topic}: ${err.message}`));
    }
  }

  /**
   * Normalize protocol-specific message into standard PrinterState object
   * Handles different topic data formats and merges into latest state
   * @param {string} topic Source topic
   * @param {object} data Raw message data
   * @returns {object} Normalized state {position, status, temperature}
   * @private
   */
  _normalizeState(topic, data) {
    // Handle OctoPrint MQTT topics
    if (topic === this.config.topics.printerState) {
      // Full state update example: {state: {text:'Printing', flags:{}}, currentZ:0.2, progress:{completion:20}}
      if (data.state) {
        this.latestState.status.is_printing = data.state.text === 'Printing';
        this.latestState.status.is_extruding = !!data.state.flags?.printing;
      }
      if (data.currentZ !== undefined) {
        this.latestState.position.z = Number(data.currentZ);
      }
      if (data.currentXYZ) {
        // Some plugins may provide position object
        this.latestState.position.x = Number(data.currentXYZ.x ?? this.latestState.position.x);
        this.latestState.position.y = Number(data.currentXYZ.y ?? this.latestState.position.y);
        this.latestState.position.z = Number(data.currentXYZ.z ?? this.latestState.position.z);
      }
      if (data.tool0 && data.tool0.actual !== undefined) {
        this.latestState.temperature.nozzle = Number(data.tool0.actual);
      }
      if (data.bed && data.bed.actual !== undefined) {
        this.latestState.temperature.bed = Number(data.bed.actual);
      }
      if (data.extruder && data.extruder.current !== undefined) {
        this.latestState.position.e = Number(data.extruder.current);
      }
    } else if (topic === this.config.topics.movement) {
      // Position update
      if (data.x !== undefined) this.latestState.position.x = data.x;
      if (data.y !== undefined) this.latestState.position.y = data.y;
      if (data.z !== undefined) this.latestState.position.z = data.z;
      if (data.e !== undefined) this.latestState.position.e = data.e;
    } else if (topic === this.config.topics.extrusion) {
      // Extrusion event
      if (data.is_extruding !== undefined) {
        this.latestState.status.is_extruding = data.is_extruding;
      }
    } else if (topic === this.config.topics.temperature) {
      // Temperature update
      if (data.tool0 && data.tool0.actual !== undefined) {
        this.latestState.temperature.nozzle = data.tool0.actual;
      }
      if (data.bed && data.bed.actual !== undefined) {
        this.latestState.temperature.bed = data.bed.actual;
      }
    }

    // Return full normalized state
    return {
      timestamp: new Date().toISOString(),
      position: { ...this.latestState.position },
      status: { ...this.latestState.status },
      temperature: { ...this.latestState.temperature },
    };
  }

  /**
   * Disconnect from MQTT broker
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!mqtt) {
      // Mock disconnect
      this.isConnected = false;
      this._emit('disconnected');
      console.log('MQTT subscriber disconnected (mock)');
      return;
    }

    if (this.client) {
      return new Promise((resolve) => {
        this.client.end(true, (err) => {
          if (err) {
            console.error('Error disconnecting MQTT:', err);
          }
          this.isConnected = false;
          this._emit('disconnected');
          resolve();
        });
      });
    }
  }

  /**
   * Register event listener
   * @param {string} event Event type: 'stateUpdate', 'error', 'connected', 'disconnected'
   * @param {Function} callback Event handler
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Unregister event listener
   * @param {string} event Event type
   * @param {Function} callback Event handler to remove
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event to all registered listeners
   * @param {string} event Event type
   * @param {*} data Event data
   * @private
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in ${event} listener:`, err);
        }
      });
    }
  }

  /**
   * Handle MQTT connection event
   * @private
   */
  _handleConnect() {
    this.isConnected = true;
    this._emit('connected');
  }

  /**
   * Handle MQTT error event
   * @param {Error} error Error object
   * @private
   */
  _handleError(error) {
    this._emit('error', error);
  }

  /**
   * Handle MQTT disconnection event
   * @private
   */
  _handleDisconnect() {
    this.isConnected = false;
    this._emit('disconnected');
  }
}

export default MQTTSubscriber;
