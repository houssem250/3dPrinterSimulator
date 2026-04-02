/**
 * @file PrinterState.js
 * @description The central state hub for the printer simulation.
 * 
 * It manages the current frame and handles a ring buffer of historical frames.
 * It uses an event-based approach to notify subscribers of changes.
 */

import { PrinterFrame } from './PrinterFrame.js';

export class PrinterState {
  /**
   * Initializes the state with default values.
   * @param {number} historySize Max number of historical frames to keep.
   */
  constructor(historySize = 100) {
    this.current = PrinterFrame.createDefault();
    this.historySize = historySize;
    this.history = []; // Ring buffer: most recent at the end

    /** @type {Function[]} */
    this.subscribers = [];
  }

  /**
   * Updates the current state with a new frame and notifies subscribers.
   * @param {object} frame New normalized PrinterFrame.
   */
  update(frame) {
    if (!PrinterFrame.isValid(frame)) {
      console.warn('PrinterState.update: Invalid frame received. Skipping update.');
      return;
    }

    // Move current to history
    this.history.push(this.current);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }

    this.current = frame;
    this._notifySubscribers();
  }

  /**
   * Reset the state to default.
   */
  reset() {
    this.current = PrinterFrame.createDefault();
    this.history = [];
    this._notifySubscribers();
  }

  /**
   * Register a callback for state changes.
   * @param {Function} callback 
   * @returns {void}
   */
  subscribe(callback) {
    this.subscribers.push(callback);
    // Immediately call back with current state to sync new subscriber
    callback(this.current);
  }

  /**
   * Unregister a callback.
   * @param {Function} callback 
   */
  unsubscribe(callback) {
    this.subscribers = this.subscribers.filter(s => s !== callback);
  }

  /**
   * Helper to check the current position.
   */
  get currentPosition() {
    return this.current.pos;
  }

  /**
   * Helper to get a human-readable summary.
   */
  getSummary() {
    return {
      pos: this.current.pos,
      temp: this.current.temp,
      isPrinting: this.current.status.isPrinting,
      isHomed: this.current.status.isHomed,
      layer: this.current.layer,
      historyCount: this.history.length
    };
  }

  _notifySubscribers() {
    for (const sub of this.subscribers) {
      try {
        sub(this.current);
      } catch (e) {
        console.error('PrinterState: Subscriber error:', e);
      }
    }
  }
}
