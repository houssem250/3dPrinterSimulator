/**
 * @file stream_simulator.js
 * @description Stream mode simulator that reflects external printer state in real-time.
 *
 * This module receives real-time state updates from MQTT and applies them to the 3D
 * visualization by directly manipulating the axis positions and filament renderer.
 * It reuses the existing PrintingMotion, axis, and FilamentRenderer infrastructure
 * from outside the stream folder.
 *
 * Key features:
 * - Validates printer state before applying updates
 * - Smooth interpolation of position changes
 * - Conditional extrusion based on stream data
 * - Prevents conflicts with standalone mode
 *
 * @module stream/stream_simulator
 */

import { StreamStateProvider } from './stream_state_provider.js';
import { StreamAlerts } from './stream_alerts.js';
import { StreamDebugPublisher } from './stream_debug_publisher.js';

export class StreamSimulator {
  /**
   * @param {MQTTSubscriber} subscriber MQTT subscriber instance
   */
  constructor(subscriber) {
    this.subscriber = subscriber;
    this.stateProvider = new StreamStateProvider();
    this.alerts = new StreamAlerts();
    this.debugPublisher = new StreamDebugPublisher(subscriber);

    this.isSimulating = false;
    this.lastUpdateTime = null;
    this.interpolationDuration = 100; // ms for smooth position transitions
    this.lastEValue = 0; // Track E-axis for extrusion detection

    // Bind event handlers
    this._handleMQTTUpdate = this._handleMQTTUpdate.bind(this);
    this._handleMQTTError = this._handleMQTTError.bind(this);
  }

  /**
   * Start the stream simulator
   * Throws if printer is in process
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isSimulating) {
      console.warn('Stream simulator already running');
      return;
    }

    // Check if safe to start
    if (!this.stateProvider.canStreamPrinterState()) {
      const alert = this.alerts.alertPrinterInProcess();
      throw new Error(
        'Cannot start stream mode: Printer is in process. ' +
        'Wait for completion or reset before enabling stream mode.'
      );
    }

    // Connect MQTT subscriber
    try {
      await this.subscriber.connect();
      await this.subscriber.subscribe();
    } catch (err) {
      this.alerts.alertMQTTError(err.message);
      throw err;
    }

    // Setup event listeners
    this.subscriber.on('stateUpdate', this._handleMQTTUpdate);
    this.subscriber.on('error', this._handleMQTTError);

    this.isSimulating = true;
    this.alerts.alertStreamModeActive();
    console.log('Stream simulator started');
  }

  /**
   * Stop the stream simulator
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isSimulating) {
      return;
    }

    this.subscriber.off('stateUpdate', this._handleMQTTUpdate);
    this.subscriber.off('error', this._handleMQTTError);

    // Disconnect MQTT subscriber
    try {
      await this.subscriber.disconnect();
    } catch (err) {
      console.error('Error disconnecting MQTT:', err);
    }

    this.isSimulating = false;
    this.alerts.alertStreamModeInactive();
    console.log('Stream simulator stopped');
  }

  /**
   * Handle incoming MQTT state update
   * Applies position and extrusion updates to the 3D scene
   * @param {object} state Normalized printer state from subscriber
   * @private
   */
  _handleMQTTUpdate(state) {
    // Debug: show incoming state
    console.debug('[StreamSimulator] MQTT update received', state);

    // Safety check: ensure printer is still in reset mode
    if (!this.stateProvider.canStreamPrinterState()) {
      this.alerts.alertModeConflict();
      console.warn('Printer switched to process mode, pausing stream updates');
      return;
    }

    try {
      // Apply position updates to axes
      this._applyPositionUpdate(state.position);

      // Apply extrusion updates
      this._applyExtrusionUpdate(state.position.e, state.status.is_extruding);

      this.lastUpdateTime = Date.now();
    } catch (err) {
      console.error('Failed to apply stream update:', err);
      this.alerts.alertParseError(err.message);
    }
  }

  /**
   * Apply position update to printer axes
   * Sets X, Y, Z axes to new positions with instant snapping
   * (Stream mode mirrors real printer state in real-time)
   * @param {object} position Position data {x, y, z, e}
   * @private
   */
  _applyPositionUpdate(position) {
    const axes = this.stateProvider.getAxes();

    if (!axes.xAxis || !axes.yAxis || !axes.zAxis) {
      throw new Error('Axes not available in AppContext');
    }

    // Use setPosition for instant snapping (mirrors real printer state)
    // Stream mode follows external state, not the timeline
    if (position.x !== undefined) {
      axes.xAxis.setPosition(position.x);
    }
    if (position.y !== undefined) {
      axes.yAxis.setPosition(position.y);
    }
    if (position.z !== undefined) {
      axes.zAxis.setPosition(position.z);
    }
  }

  /**
   * Apply extrusion update
   * Appends filament to visualization when extruder is active
   * Reuses the same FilamentRenderer.appendPoint() from standalone mode
   * @param {number} eValue Current E-axis value (filament length extruded)
   * @param {boolean} isExtruding Whether extruder is currently active
   * @private
   */
  _applyExtrusionUpdate(eValue, isExtruding) {
    const filamentRenderer = this.stateProvider.getFilamentRenderer();

    if (!filamentRenderer) {
      throw new Error('FilamentRenderer not available in AppContext');
    }

    // Guard against undefined eValue
    if (eValue === undefined || eValue === null) {
      return;
    }

    // Detect E-axis movement
    const eChanged = eValue !== this.lastEValue;
    const eIncreased = eValue > this.lastEValue;
    this.lastEValue = eValue;

    if (isExtruding && eChanged && eIncreased) {
      // Extruder is active and E is increasing: append point to filament
      // FilamentRenderer reads nozzle position directly from scene graph
      // This is the same method used in standalone mode at printing_motion.js:346
      filamentRenderer.appendPoint();
    } else if (!isExtruding && eChanged) {
      // Retraction or travel: add a break in the filament
      // Marks segment end without continuing filament
      filamentRenderer.appendBreak();
    }
  }

  /**
   * Handle MQTT errors
   * @param {Error} error Error object
   * @private
   */
  _handleMQTTError(error) {
    console.error('MQTT error in stream simulator:', error);
    this.alerts.alertMQTTError(error.message);
  }

  /**
   * Check if simulator is currently running
   * @returns {boolean}
   */
  isActive() {
    return this.isSimulating;
  }

  /**
   * Get alert system for this simulator
   * @returns {StreamAlerts}
   */
  getAlerts() {
    return this.alerts;
  }
}

export default StreamSimulator;
