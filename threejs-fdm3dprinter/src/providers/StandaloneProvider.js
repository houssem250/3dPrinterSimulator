/**
 * @file StandaloneProvider.js
 * @description Local G-code loop provider.
 * 
 * It manages the timing of G-code execution using setTimeout/await.
 * It's responsible for the "virtual machine state" (offsets, modes, last E).
 */

import { BaseProvider } from './BaseProvider.js';
import { PRINTER_CONFIG } from '../../config/printer_config.js';

export class StandaloneProvider extends BaseProvider {
  /**
   * @param {import('../core/FrameNormalizer.js').FrameNormalizer} normalizer
   */
  constructor(normalizer) {
    super(normalizer);
    this.name = 'StandaloneProvider';
    
    this.moves = [];
    this.isRunning = false;
    this.isPaused = false;
    this.currentIndex = 0;
    
    // Virtual Machine State
    this.state = {
      x: 0, y: 0, z: 0, e: 0, f: PRINTER_CONFIG.defaults.motion.feedrate,
      offsetX: 0, offsetY: 0, offsetZ: 0,
      lastE: undefined,
      retractBudget: 0,
      currentLayer: 0,
    };
    
    this.speedMultiplier = PRINTER_CONFIG.PRINTING.DEFAULT_SPEED_MULTIPLIER;
  }

  /**
   * Returns a raw (mm-based) frame for a specific command index.
   * Used for synchronized and augmented streaming.
   * @param {number} cmdIndex 
   * @returns {object|null}
   */
  getFrameAtIndex(cmdIndex) {
    const move = this.moves.findLast ? 
      this.moves.findLast(m => m.cmdIndex === cmdIndex) :
      [...this.moves].reverse().find(m => m.cmdIndex === cmdIndex);

    if (!move) return null;
    
    return {
      pos: { x: move.X, y: move.Y, z: move.Z, e: move.E },
      is_extruding: move.isExtruding,
      feedrate: move.F,
      layer: move.layer,
      status: { isPrinting: true, isHomed: true }
    };
  }


  /**
   * Loads a move list (from GCodeLoader).
   * @param {object[]} moves 
   */
  load(moves) {
    this.moves = moves;
    this.currentIndex = 0;
    console.log(`StandaloneProvider: Loaded ${moves.length} moves.`);
  }

  async start() {
    if (this.isRunning) return;
    if (this.moves.length === 0) {
      console.warn('StandaloneProvider: No moves loaded.');
      return;
    }
    
    this.isRunning = true;
    super.start();
    
    await this._runLoop();
  }

  stop() {
    this.isRunning = false;
    super.stop();
  }

  pause() { this.isPaused = true; }
  resume() { this.isPaused = false; }

  /**
   * Main execution loop.
   * @private
   */
  async _runLoop() {
    for (let i = this.currentIndex; i < this.moves.length; i++) {
      if (!this.isRunning) break;

      while (this.isPaused && this.isRunning) {
        await this._delay(100);
      }
      if (!this.isRunning) break;

      this.currentIndex = i;
      const move = this.moves[i];
      await this._processMove(move);
    }
    
    this.isRunning = false;
    console.log('StandaloneProvider: Finished execution.');
  }

  /**
   * @param {object} move 
   * @private
   */
  async _processMove(move) {
    const cmd = (move.cmd || 'G1').toUpperCase();

    // 1. Meta / Slicer Commands
    if (cmd === 'SET_HEIGHT') return; // Handled by engine/renderer
    if (cmd === 'SET_WIDTH') return;
    if (cmd === 'SET_LAYER') { this.state.currentLayer = move.value; return; }

    // 2. G28: Home
    if (cmd === 'G28') {
      const dur = PRINTER_CONFIG.PRINTING.HOME_DURATION_MS;
      this.state.x = 0; this.state.y = 0; this.state.z = 0;
      this.emit({ pos: { x: 0, y: 0, z: 0, e: 0 }, status: { isHomed: true } });
      await this._delay(dur + PRINTER_CONFIG.PRINTING.HOME_SETTLE_MS);
      return;
    }

    // 3. G92: Reset / Offsets
    if (cmd === 'G92') {
      if (move.X !== undefined) { this.state.offsetX = this.state.x - move.X; this.state.x = move.X; }
      if (move.Y !== undefined) { this.state.offsetY = this.state.y - move.Y; this.state.y = move.Y; }
      if (move.Z !== undefined) { this.state.offsetZ = this.state.z - move.Z; this.state.z = move.Z; }
      if (move.E !== undefined) {
         if (this.state.lastE !== undefined) {
           this.state.retractBudget = (this.state.lastE > move.E) ? (this.state.lastE - move.E) : 0;
         }
         this.state.lastE = move.E;
      }
      return;
    }

    // 4. M-Commands (minimal implementation for demo)
    if (cmd === 'M104' || cmd === 'M109' || cmd === 'M140' || cmd === 'M190') {
      // Just emit temp update
      this.emit({ temp: { nozzle: move.temp || 0, bed: (cmd.startsWith('M14') || cmd.startsWith('M19')) ? move.temp : 0 } });
      if (cmd === 'M109' || cmd === 'M190') await this._delay(50);
      return;
    }

    // 5. G0 / G1: Motion
    if (cmd === 'G0' || cmd === 'G1') {
      if (move.F !== undefined) this.state.f = move.F;

      const tX = move.X !== undefined ? move.X : this.state.x;
      const tY = move.Y !== undefined ? move.Y : this.state.y;
      const tZ = move.Z !== undefined ? move.Z : this.state.z;

      const adjX = tX + this.state.offsetX;
      const adjY = tY + this.state.offsetY;
      const adjZ = tZ + this.state.offsetZ;

      const dx = adjX - (this.state.x + this.state.offsetX);
      const dy = adjY - (this.state.y + this.state.offsetY);
      const dz = adjZ - (this.state.z + this.state.offsetZ);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      const hasXY = (Math.abs(dx) + Math.abs(dy)) > 0.001;
      const extruding = this._checkExtrusion(cmd, move, hasXY);

      const duration = this._calculateDuration(dist);

      // In Standalone mode, we emit the START of the move. 
      // The Engine handles the linear animation over the given duration.
      this.emit({
        pos: { x: adjX, y: adjY, z: adjZ, e: move.E ?? this.state.e },
        is_extruding: extruding,
        feedrate: this.state.f,
        layer: this.state.currentLayer,
        duration: duration // Engine can use this to know how long the move takes
      });

      await this._delay(duration);

      // Update state for next move
      this.state.x = tX;
      this.state.y = tY;
      this.state.z = tZ;
      if (move.E !== undefined) {
        const deltaE = move.E - (this.state.lastE ?? move.E);
        if (deltaE > 0 && this.state.retractBudget > 0) {
          this.state.retractBudget = Math.max(0, this.state.retractBudget - deltaE);
        }
        this.state.lastE = move.E;
        this.state.e = move.E;
      }
    }
  }

  _calculateDuration(dist) {
    if (dist < 0.001) return PRINTER_CONFIG.PRINTING.MIN_MOVE_DURATION_MS;
    const speedMmMs = (this.state.f / 60) * this.speedMultiplier / 1000;
    return Math.max(PRINTER_CONFIG.PRINTING.MIN_MOVE_DURATION_MS, dist / speedMmMs);
  }

  _checkExtrusion(cmd, move, hasXY) {
    if (cmd === 'G0') return false;
    if (move.E === undefined) return false;
    if (!hasXY) return false;
    const eDelta = move.E - (this.state.lastE ?? move.E);
    if (eDelta <= 0) return false;
    if (this.state.retractBudget > 0) return false;
    return true;
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
