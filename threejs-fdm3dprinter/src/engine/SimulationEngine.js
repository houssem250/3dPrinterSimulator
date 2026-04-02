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
    this._lastFilamentPos = { x: null, y: null, z: null };
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
        // PRECISION FILTERING: Only add filament point if we moved > 0.1mm
        const dx = x - (this._lastFilamentPos.x || 0);
        const dy = y - (this._lastFilamentPos.y || 0);
        const dz = z - (this._lastFilamentPos.z || 0);
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

        // Force point update on extrusion transition (to start/stop cleanly)
        const stateChanged = (isExtruding !== this._lastIsExtruding);
        
        if (dist > 0.1 || stateChanged) {
          this.filament.appendPoint();
          this._lastFilamentPos = { x, y, z };
        }
      } else {
        this.filament.appendBreak();
        this._lastFilamentPos = { x: null, y: null, z: null };
      }
    }

    this._lastIsExtruding = isExtruding;
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
