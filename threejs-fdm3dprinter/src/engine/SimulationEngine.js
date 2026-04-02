/**
 * @file SimulationEngine.js
 * @description The visual "sink" that drives the 3D model and filament.
 * 
 * It listens to PrinterState and translates frames into axis movements
 * and filament deposition calls.
 */

export class SimulationEngine {
  /**
   * @param {object} axes { x, y, z } AxisMotion instances.
   * @param {import('../../visualization/filament_renderer.js').FilamentRenderer} filament
   */
  constructor(axes, filament) {
    this.xAxis = axes.x;
    this.yAxis = axes.y;
    this.zAxis = axes.z;
    this.filament = filament;
    
    this._lastIsExtruding = false;
  }

  /**
   * Connects the engine to a state source.
   * @param {import('../core/PrinterState.js').PrinterState} state 
   */
  connect(state) {
    state.subscribe((frame) => this._renderFrame(frame));
  }

  /**
   * Processes a normalized frame and updates the scene.
   * @param {object} frame 
   * @private
   */
  async _renderFrame(frame) {
    const { x, y, z } = frame.pos;
    const dur = frame.duration || 0;
    const isExtruding = frame.is_extruding;

    // Handle filament state transition
    if (isExtruding && !this._lastIsExtruding) {
        // Just started extruding, make sure we have a fresh segment
        this.filament.appendBreak(); 
    }

    if (dur > 0) {
      // 1. Start Linear Animation
      this.xAxis.moveToPositionLinear(x, dur);
      this.yAxis.moveToPositionLinear(y, dur);
      this.zAxis.moveToPositionLinear(z, dur);

      // 2. Sync Filament
      if (isExtruding) {
        this.filament.appendPoint(); // Start of segment
      }

      // 3. Wait for physical duration
      await this._delay(dur);

      // 4. Force Snap to final position for accuracy
      this.xAxis.setPosition(x);
      this.yAxis.setPosition(y);
      this.zAxis.setPosition(z);

      if (isExtruding) {
        this.filament.appendPoint(); // End of segment
      } else {
        this.filament.appendBreak(); // Commit the travel
      }
    } else {
      // Real-time mode (Stream) — frames arrive already interpolated
      this.xAxis.setPosition(x);
      this.yAxis.setPosition(y);
      this.zAxis.setPosition(z);

      if (isExtruding) {
        this.filament.appendPoint();
      } else {
        this.filament.appendBreak();
      }
    }

    this._lastIsExtruding = isExtruding;
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
