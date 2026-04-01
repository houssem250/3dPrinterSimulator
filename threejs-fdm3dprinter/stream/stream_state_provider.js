/**
 * @file stream_state_provider.js
 * @description Provides access to printer state from outside the stream folder.
 *
 * This module acts as a bridge to access the current printer state from the
 * PrinterMotion (AppContext.printer) to determine if the printer is in process or in reset mode.
 * This is crucial for deciding whether stream simulation can proceed.
 *
 * Stream mode can ONLY run when the printer is not executing standalone moves.
 *
 * @module stream/stream_state_provider
 */

import { AppContext } from '../app_context.js';

export class StreamStateProvider {
  constructor() {
    // No parameters - uses AppContext directly to access live printer state
  }

  /**
   * Check if printer is currently processing (standalone/examples mode)
   * @returns {boolean} True if printer is executing moves, false if idle
   */
  isPrinterInProcess() {
    // Check if PrintingMotion is actively running
    const printer = AppContext.printer;
    if (!printer) return false;
    return printer.isRunning || printer.isPaused;
  }

  /**
   * Check if printer is in reset/idle mode (safe to stream)
   * @returns {boolean} True if printer can accept stream data
   */
  canStreamPrinterState() {
    return !this.isPrinterInProcess();
  }

  /**
   * Get current printer state summary
   * @returns {object} Current state object
   */
  getPrinterState() {
    const printer = AppContext.printer;
    if (!printer) return { isRunning: false, currentMode: 'unknown' };

    return {
      isRunning: printer.isRunning,
      isPaused: printer.isPaused,
      currentMode: this.isPrinterInProcess() ? 'standalone' : 'idle',
      positions: {
        x: AppContext.xAxis?.getPosition?.() ?? 0,
        y: AppContext.yAxis?.getPosition?.() ?? 0,
        z: AppContext.zAxis?.getPosition?.() ?? 0,
      },
    };
  }

  /**
   * Get position of specific axis
   * @param {string} axisName Axis name ('X', 'Y', 'Z')
   * @returns {number} Current position in mm
   */
  getAxisPosition(axisName) {
    const axis = AppContext[`${axisName}Axis`];
    return axis?.getPosition?.() ?? 0;
  }

  /**
   * Get reference to printer motion controller
   * @returns {PrintingMotion|null}
   */
  getPrinter() {
    return AppContext.printer;
  }

  /**
   * Get reference to filament renderer
   * @returns {FilamentRenderer|null}
   */
  getFilamentRenderer() {
    return AppContext.filament ?? null;
  }

  /**
   * Get references to axis objects
   * @returns {object} { xAxis, yAxis, zAxis }
   */
  getAxes() {
    return {
      xAxis: AppContext.xAxis,
      yAxis: AppContext.yAxis,
      zAxis: AppContext.zAxis,
    };
  }
}

export default StreamStateProvider;
