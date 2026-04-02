/**
 * @file StreamProvider.js
 * @description Real-time data provider with jitter buffering and LERP.
 * 
 * It manages a small buffer of incoming frames and uses requestAnimationFrame
 * to interpolate smoothly between them, hiding network jitter.
 */

import { BaseProvider } from './BaseProvider.js';

export class StreamProvider extends BaseProvider {
  /**
   * @param {import('../core/FrameNormalizer.js').FrameNormalizer} normalizer
   * @param {number} bufferDelayMs Time to delay playback for jitter smoothing.
   */
  constructor(normalizer, bufferDelayMs = 120) {
    super(normalizer);
    this.name = 'StreamProvider';
    this.bufferDelayMs = bufferDelayMs;
    
    this.queue = []; // Array of { raw, timestamp }
    this.isRunning = false;
    
    this._lastEmittedFrame = null;
    this._rafId = null;
    this._dataSource = null; // StandaloneProvider for pointer lookups
  }

  /**
   * Connects this stream to a standalone provider for command lookups.
   * @param {import('./StandaloneProvider.js').StandaloneProvider} provider
   */
  setDataSource(provider) {
    this._dataSource = provider;
  }

  /**
   * Receives raw packets. If cmdIndex is present, it enriches the data.
   * Augmented Mode: Prioritize 'raw' telemetry for positions, use 'canonical' for metadata.
   * @param {object} raw 
   */
  push(raw) {
    if (!this.isRunning) return;

    let data = { ...raw }; // Start with the raw MQTT data

    // Use "Pointer" lookup if available to augment the telemetry
    if (raw.cmdIndex !== undefined && this._dataSource) {
      const canonical = this._dataSource.getFrameAtIndex(raw.cmdIndex);
      if (canonical) {
        // AUGMENT raw telemetry with high-level G-code context
        data = {
          ...data,
          // Overwrite with metadata that MQTT lacks
          layer: canonical.layer,
          // Use canonical extrusion status if raw is uncertain
          is_extruding: raw.is_extruding ?? canonical.is_extruding,
          // Marker for UI/Debugging
          is_synced: true
        };
      }
    }
    
    this.queue.push({
      data: data,
      arrivalTime: Date.now()
    });
    
    if (this.queue.length > 50) this.queue.shift();
  }


  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    super.start();
    
    this._loop();
  }

  stop() {
    this.isRunning = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    super.stop();
  }

  /**
   * Drains the jitter buffer and interpolates.
   * @private
   */
  _loop() {
    if (!this.isRunning) return;
    
    this._processBuffer();
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _processBuffer() {
    if (this.queue.length < 2) {
      // Not enough data to interpolate, just emit last if available
      if (this.queue.length === 1 && !this._lastEmittedFrame) {
         this.emit(this.queue[0].data);
      }
      return;
    }

    const now = Date.now();
    const targetTime = now - this.bufferDelayMs;

    // Find the pair of frames that bracket targetTime
    let i = 0;
    while (i < this.queue.length - 1 && this.queue[i + 1].arrivalTime < targetTime) {
      i++;
    }

    // Clean up old frames
    if (i > 0) {
      this.queue.splice(0, i);
      i = 0;
    }

    const f1 = this.queue[0];
    const f2 = this.queue[1];

    if (!f1 || !f2) return;

    // Calculate LERP factor (alpha)
    const span = f2.arrivalTime - f1.arrivalTime;
    let alpha = 0;
    if (span > 0) {
      alpha = (targetTime - f1.arrivalTime) / span;
      alpha = Math.max(0, Math.min(1, alpha));
    }

    const interpolated = this._lerpFrames(f1.data, f2.data, alpha);
    this.emit(interpolated);
    this._lastEmittedFrame = interpolated;
  }

  /**
   * Linearly interpolates between two raw frame objects.
   * @private
   */
  _lerpFrames(d1, d2, alpha) {
    const lerp = (a, b, t) => a + (b - a) * t;
    
    const p1 = d1.pos || d1.position || {};
    const p2 = d2.pos || d2.position || {};
    
    return {
      timestamp: lerp(d1.timestamp || 0, d2.timestamp || 0, alpha),
      pos: {
        x: lerp(p1.x || 0, p2.x || 0, alpha),
        y: lerp(p1.y || 0, p2.y || 0, alpha),
        z: lerp(p1.z || 0, p2.z || 0, alpha),
        e: lerp(p1.e || 0, p2.e || 0, alpha),
      },
      is_extruding: alpha < 0.5 ? (d1.is_extruding ?? false) : (d2.is_extruding ?? false),
      temp: {
        nozzle: lerp(d1.temp?.nozzle || 0, d2.temp?.nozzle || 0, alpha),
        bed: lerp(d1.temp?.bed || 0, d2.temp?.bed || 0, alpha),
      },
      feedrate: lerp(d1.feedrate || 0, d2.feedrate || 0, alpha),
      layer: alpha < 0.5 ? (d1.layer || 0) : (d2.layer || 0),
      status: d2.status // Snap to latest status
    };
  }
}
