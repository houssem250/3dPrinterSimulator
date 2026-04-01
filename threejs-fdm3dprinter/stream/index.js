/**
 * @file index.js
 * @description Stream Mode Module - Main entry point for stream mode initialization.
 *
 * Stream mode implements a "Digital Twin" receiver where the 3D simulator
 * receives real-time printer state from an external source (MQTT) and
 * reflects updates in real-time on the 3D visualization.
 *
 * Key Architecture:
 * - Stream mode operates independently from standalone/examples mode
 * - Printer can ONLY be in ONE mode at a time
 * - State Provider validates mode safety before accepting updates
 * - Filament rendering reuses the same infrastructure as standalone
 * - All changes are localized inside the stream folder
 *
 * @module stream
 */

export { MQTT_CONFIG, getConfig, getConnectionOptions, getTopicsToSubscribe } from './mqtt_config.js';
export { MQTTSubscriber } from './mqtt_subscriber.js';
export { StreamStateProvider } from './stream_state_provider.js';
export { StreamSimulator } from './stream_simulator.js';
export { StreamAlerts } from './stream_alerts.js';
export { StreamDebugPublisher } from './stream_debug_publisher.js';

/**
 * Stream Mode Architecture
 * ═════════════════════════════════════════════════════════════════
 *
 * 1. MQTT Communication Layer
 *    ├── mqtt_config.js        : Configuration for MQTT connection & topics
 *    └── mqtt_subscriber.js    : Connects to broker, subscribes to topics,
 *                               parses JSON into PrinterState format
 *
 * 2. State Management & Safety
 *    ├── stream_state_provider.js  : Reads printer state from AppContext.printer
 *                                   to check if printer is in process (safety check)
 *    └── stream_simulator.js       : Applies stream updates to axes and filament
 *                                   reusing existing 3D scene objects
 *
 * 3. User Feedback
 *    └── stream_alerts.js      : Alert system for mode conflicts & status events
 *
 *
 * Usage Pattern in main.js or app initialization:
 * ═════════════════════════════════════════════════════════════════
 *
 * import { MQTTSubscriber, StreamSimulator } from './stream/index.js';
 *
 * // 1. Create MQTT subscriber (with default config)
 * const subscriber = new MQTTSubscriber();
 *
 * // 2. Create stream simulator (takes subscriber)
 * const streamSimulator = new StreamSimulator(subscriber);
 *
 * // 3. Expose to window.app for console access
 * AppContext.stream = streamSimulator;
 *
 * // 4. Start when ready (only works if printer is idle)
 * try {
 *   await streamSimulator.start();
 *   console.log('Stream mode active');
 * } catch (err) {
 *   console.error('Cannot start stream:', err.message);
 * }
 *
 * // 5. Listen for alerts
 * streamSimulator.getAlerts().onAlert((alert) => {
 *   console.log(`[${alert.type}] ${alert.message}`);
 * });
 *
 * // 6. Stop when done
 * await streamSimulator.stop();
 *
 *
 * Key Integration Points with Existing Code
 * ═════════════════════════════════════════════════════════════════
 *
 * AppContext.printer (PrintingMotion)
 *   └─ Used by StreamStateProvider to check:
 *      - isRunning: Is printer executing standalone moves?
 *      - isPaused: Is printer paused?
 *      → Can only stream if both are false (printer is idle/reset)
 *
 * AppContext.xAxis, yAxis, zAxis (AxisMotion)
 *   └─ Used by StreamSimulator to apply position updates:
 *      - axis.setPosition(position) : Set absolute position instantly
 *      → Mirrors real printer motion
 *
 * AppContext.filament (FilamentRenderer)
 *   └─ Used by StreamSimulator to render extrusion:
 *      - filamentRenderer.appendPoint()  : When extruding
 *      - filamentRenderer.appendBreak()  : When traveling/retracting
 *      → Reuses same filament geometry as standalone mode
 *
 *
 * MQTT Message Format Expected from Broker
 * ═════════════════════════════════════════════════════════════════
 *
 * OctoPrint MQTT Plugin Format:
 * - octoprint/printer/state: { "state": { "text": "Printing", "flags": {...} } }
 * - octoprint/gcode/machine/position: { "x": 100, "y": 80, "z": 2.5, "e": 1234 }
 * - octoprint/printer/temperature: { "tool0": { "actual": 210 }, "bed": { "actual": 60 } }
 * - octoprint/printer/extrusion: { "is_extruding": true } (may require custom plugin)
 *
 *
 *
 * Error Scenarios & Safety
 * ═════════════════════════════════════════════════════════════════
 *
 * 1. Printer in Process (Examples Running):
 *    - StreamSimulator.start() throws
 *    - Alert: "Cannot start stream mode: Printer is in process"
 *    → Wait for examples to complete, then retry
 *
 * 2. Mode Conflict (Standalone started while streaming):
 *    - StreamSimulator pauses updates (doesn't error, just waits)
 *    - Alert: "Mode Conflict: Printer switched to standalone mode"
 *    → Updates resume automatically when printer returns to idle
 *
 * 3. MQTT Connection Error:
 *    - StreamSimulator.start() throws
 *    - Alert: "MQTT Error: [connection error message]"
 *    → Check broker URL, credentials, network connection
 *
 * 4. Parse Error (Invalid JSON from MQTT):
 *    - Single message ignored, stream continues
 *    - Alert: "Parse Error: Failed to parse stream data"
 *    → Check MQTT payload format
 *
 */

/**
 * Create and initialize stream mode
 * @param {object} [options] Configuration options
 * @param {string} [options.brokerUrl] MQTT broker URL
 * @param {string} [options.username] MQTT username
 * @param {string} [options.password] MQTT password
 * @returns {object} { simulator, subscriber, alerts }
 */
export async function initStreamMode(options = {}) {
  const { MQTTSubscriber } = await import('./mqtt_subscriber.js');
  const { StreamSimulator } = await import('./stream_simulator.js');

  const subscriber = new MQTTSubscriber(options);
  const simulator = new StreamSimulator(subscriber);

  return {
    simulator,
    subscriber,
    alerts: simulator.getAlerts(),
  };
}

export default { initStreamMode };
