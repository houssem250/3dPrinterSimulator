/**
 * @file FrameNormalizer.js
 * @description Normalizes raw provider data into canonical PrinterFrames.
 * 
 * It handles:
 * 1. Coordinate mapping (G-code mm to axis motor units).
 * 2. Placement logic (center vs corner).
 * 3. Default value injection for missing fields.
 */

import { PrinterFrame } from './PrinterFrame.js';

export class FrameNormalizer {
  /**
   * @param {object} config PRINTER_CONFIG reference.
   */
  constructor(config) {
    this.config = config;
    
    // Cache hardware dims for faster mapping
    this.bedWidth = config.hardware.bed.width;
    this.bedDepth = config.hardware.bed.depth;
    this.maxTravelX = config.AXES.X.MAX_TRAVEL_MM;
    this.maxTravelY = config.AXES.Y.MAX_TRAVEL_MM;
    this.maxTravelZ = config.AXES.Z.MAX_TRAVEL_MM;
    
    this.placement = config.PRINTING.DEFAULT_PLACEMENT;
  }

  /**
   * Converts a raw payload from any provider into a normalized PrinterFrame.
   * @param {object} raw 
   * @param {object} [context] Optional context (e.g. current offsets)
   * @returns {object}
   */
  normalize(raw, context = {}) {
    const frame = PrinterFrame.createDefault();
    
    frame.timestamp = raw.timestamp || Date.now();
    
    // 1. Position Mapping (mm -> axis units)
    const rawPos = raw.pos || raw.position || {};
    const gX = rawPos.x ?? rawPos.X ?? context.lastX ?? 0;
    const gY = rawPos.y ?? rawPos.Y ?? context.lastY ?? 0;
    const gZ = rawPos.z ?? rawPos.Z ?? context.lastZ ?? 0;
    const gE = rawPos.e ?? rawPos.E ?? context.lastE ?? 0;

    frame.pos = {
      x: this._mapX(gX),
      y: this._mapY(gY),
      z: this._mapZ(gZ),
      e: gE
    };

    // 2. Extrusion status
    frame.is_extruding = raw.is_extruding ?? raw.extruding ?? false;
    
    // 3. Temperatures
    const rawTemp = raw.temp || raw.temperature || {};
    frame.temp = {
      nozzle: rawTemp.nozzle ?? rawTemp.hotend ?? 0,
      bed: rawTemp.bed ?? 0
    };

    // 4. Metadata
    frame.feedrate = raw.feedrate || raw.f || 0;
    frame.layer = raw.layer || 0;
    
    // 5. Status
    const rawStatus = raw.status || {};
    frame.status = {
      isPrinting: rawStatus.isPrinting ?? true,
      isPaused: rawStatus.isPaused ?? false,
      isHomed: rawStatus.isHomed ?? true
    };

    return frame;
  }

  /**
   * G-code X (mm) -> axis motor position.
   * @private
   */
  _mapX(gcodeX) {
    let v = gcodeX;
    if (this.placement === 'center') v += this.bedWidth / 2;
    return (Math.max(0, Math.min(v, this.bedWidth)) / this.bedWidth) * this.maxTravelX;
  }

  /**
   * G-code Y (mm) -> axis motor position.
   * @private
   */
  _mapY(gcodeY) {
    let v = gcodeY;
    if (this.placement === 'center') v += this.bedDepth / 2;
    return (Math.max(0, Math.min(v, this.bedDepth)) / this.bedDepth) * this.maxTravelY;
  }

  /**
   * G-code Z (mm) -> axis motor position.
   * @private
   */
  _mapZ(gcodeZ) {
    return Math.max(0, Math.min(gcodeZ, this.maxTravelZ));
  }
}
