/**
 * @file mqtt_config.js
 * @description MQTT broker configuration for stream mode.
 *
 * Centralizes connection settings, topics, and defaults for MQTT communication.
 * These settings define how the stream mode connects to the physical printer's MQTT broker.
 *
 * Environment Variables (from .env.local):
 * - VITE_MQTT_BROKER: Broker address (default: localhost)
 * - VITE_MQTT_PORT: Broker port (default: 1883)
 * - VITE_MQTT_USERNAME: Authentication username (optional)
 * - VITE_MQTT_PASSWORD: Authentication password (optional)
 * - VITE_MQTT_TOPIC_STATE: Printer state topic
 * - VITE_MQTT_TOPIC_MOVEMENT: Position updates topic
 * - VITE_MQTT_TOPIC_EXTRUSION: Extrusion events topic
 *
 * @module stream/mqtt_config
 */

// Get environment variables (Vite browser environment)
const getEnv = (key, defaultValue = undefined) => {
  // In Vite (browser), environment variables are injected into import.meta.env
  // They must have VITE_ prefix to be exposed
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[`VITE_${key}`] ?? defaultValue;
  }
  // Fallback to process.env (Node.js build/SSR)
  return process.env[`VITE_${key}`] ?? defaultValue;
};

// Helper to construct MQTT URL
const _getMqttUrl = () => {
  const broker = getEnv('MQTT_BROKER', 'localhost');
  const port = getEnv('MQTT_PORT', '9001'); // Default to WebSocket port
  const protocol = getEnv('MQTT_PROTOCOL', 'ws'); // Default to WebSocket for browser

  if (protocol === 'ws') {
    return `ws://${broker}:${port}`;
  }
  return `mqtt://${broker}:${port}`;
};

export const MQTT_CONFIG = {
  // Connection Settings
  connection: {
    // MQTT broker URL - constructed from MQTT_BROKER and MQTT_PORT env vars
    url: _getMqttUrl(),
    // Unique client identifier
    clientId: getEnv('MQTT_CLIENT_ID', `fdm-simulator-${Date.now()}`),
    // Authentication (optional)
    username: getEnv('MQTT_USERNAME') || null,
    password: getEnv('MQTT_PASSWORD') || null,
    // Connection behavior
    reconnect: true,
    reconnectPeriod: 5000, // ms
    keepalive: 60, // seconds
    connectTimeout: 10000, // ms
  },

  // Topic Configuration
  topics: {
    // Subscribe to consolidated printer state
    printerState: getEnv('MQTT_TOPIC_STATE', 'octoprint/printer/state'),
    // Subscribe to position updates
    movement: getEnv('MQTT_TOPIC_MOVEMENT', 'octoprint/gcode/machine/position'),
    // Subscribe to extrusion events
    extrusion: getEnv('MQTT_TOPIC_EXTRUSION', 'octoprint/printer/extrusion'),
    // Subscribe to temperature updates
    temperature: getEnv('MQTT_TOPIC_TEMPERATURE', 'octoprint/printer/temperature'),
    // Publish simulator mode status for acknowledgment
    simulatorMode: getEnv('MQTT_TOPIC_MODE', 'simulator/mode'),
  },

  // State Message Format (expected structure from MQTT)
  // Example incoming message structure:
  // {
  //   position: { x: 100, y: 50, z: 10, e: 0 },
  //   status: { is_extruding: true, is_printing: true },
  //   temperature: { nozzle: 210, bed: 60 },
  // }

  // Debounce/Rate Limiting
  debounceMs: parseInt(getEnv('STREAM_DEBOUNCE_MS', '100')),
  stateUpdateMaxFrequency: 10, // Maximum updates per second

  // Validation Ranges
  // Stream mode applies whatever it receives from MQTT without validation limits
  // Values are undefined — no constraint checking is performed
  validation: {
    positionRanges: undefined,
    temperatureRanges: undefined,
  },
};

/**
 * Get a nested config value with fallback
 * @param {string} path Dot-separated path (e.g., 'connection.url')
 * @param {*} defaultValue Fallback if not found
 * @returns {*} Config value or defaultValue
 */
export function getConfig(path, defaultValue = undefined) {
  const keys = path.split('.');
  let value = MQTT_CONFIG;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }

  return value;
}

/**
 * Create an MQTT client connection options object
 * @returns {object} Options for mqtt.connect()
 */
export function getConnectionOptions() {
  const { connection } = MQTT_CONFIG;
  return {
    clientId: connection.clientId,
    username: connection.username,
    password: connection.password,
    reconnectPeriod: connection.reconnectPeriod,
    keepalive: connection.keepalive,
    connectTimeout: connection.connectTimeout,
  };
}

/**
 * Get array of topics to subscribe to
 * @returns {string[]} Topic names
 */
export function getTopicsToSubscribe() {
  const { topics } = MQTT_CONFIG;
  return [
    topics.printerState,
    topics.movement,
    topics.extrusion,
    topics.temperature,
  ];
}

export default MQTT_CONFIG;
