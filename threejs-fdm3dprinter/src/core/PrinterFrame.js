/**
 * @file PrinterFrame.js
 * @description Defines the canonical data structure for a single state frame.
 * 
 * This is the "contract" between Providers and the SimulationEngine.
 * Every provider must output an object that can be normalized to this shape.
 */

export class PrinterFrame {
  /**
   * Creates a default empty frame.
   * @returns {object}
   */
  static createDefault() {
    return {
      timestamp: Date.now(),
      pos: { x: 0, y: 0, z: 0, e: 0 },
      temp: { nozzle: 0, bed: 0 },
      is_extruding: false,
      feedrate: 0,
      layer: 0,
      status: { isPrinting: false, isPaused: false, isHomed: false },
    };
  }

  /**
   * Validates if an object loosely matches the frame contract.
   * @param {object} frame 
   * @returns {boolean}
   */
  static isValid(frame) {
    return (
      frame &&
      typeof frame.timestamp === 'number' &&
      frame.pos &&
      typeof frame.pos.x === 'number' &&
      typeof frame.pos.y === 'number' &&
      typeof frame.pos.z === 'number'
    );
  }
}
