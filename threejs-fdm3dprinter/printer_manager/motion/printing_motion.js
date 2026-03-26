/**
 * @file printing_motion.js
 * @description Executes a G-code-style move list on the three printer axes
 * and renders live filament as the print progresses.
 *
 * Coordinate system
 * ──────────────────
 * G-code works in mm with the origin at the bed's front-left corner
 * (or center when `placement = 'center'`).
 *
 *   G-code X mm  →  mapped proportionally to xAxis.maxTravel
 *   G-code Y mm  →  mapped proportionally to yAxis.maxTravel
 *   G-code Z mm  →  mapped proportionally to zAxis.maxTravel
 *
 * Supported move commands
 * ────────────────────────
 *   G0  { X, Y, Z, F }    Rapid move (no extrusion)
 *   G1  { X, Y, Z, F }    Print move (with extrusion)
 *   G28 { X?, Y?, Z? }    Home specified axes (no args = home all)
 *   G92 { X?, Y?, Z? }    Set position offset (virtual zero)
 *
 * F (feedrate mm/min) persists across moves — exactly like a real printer.
 * Omitted X/Y/Z in a move means "stay at current position on that axis".
 * 
 * @module printer_manager/motion/printing_motion
 */

import { PRINTER_CONFIG } from '../../config/printer_config.js';
import * as THREE from 'three';

const {
  DEFAULT_FEEDRATE_MM_MIN,
  DEFAULT_SPEED_MULTIPLIER,
  DEFAULT_PLACEMENT,
  MIN_MOVE_DURATION_MS,
  HOME_DURATION_MS,
  HOME_SETTLE_MS,
} = PRINTER_CONFIG.PRINTING;

export class PrintingMotion {

  /**
   * @param {import('./x_axis.js').XAxisMotion} xAxis
   * @param {import('./y_axis.js').YAxisMotion} yAxis
   * @param {import('./z_axis.js').ZAxisMotion} zAxis
   * @param {object}  [options]
   * @param {'corner'|'center'} [options.placement='corner']
   *   G-code coordinate origin: 'corner' = front-left (slicer default),
   *   'center' = bed center.
   * @param {number}  [options.speedMultiplier=1]
   *   1 = real speed, 2 = 2× faster, 10 = 10× faster (for testing).
   * @param {{ width: number, depth: number }} [options.bedDimensions]
   *   Override auto-detected bed size in mm.
   */
  constructor(xAxis, yAxis, zAxis, options = {}) {
    this.xAxis = xAxis;
    this.yAxis = yAxis;
    this.zAxis = zAxis;

    this.placement = options.placement ?? DEFAULT_PLACEMENT;
    this.speedMultiplier = options.speedMultiplier ?? DEFAULT_SPEED_MULTIPLIER;

    this._initBedDimensions(options.modelLoader, options.bedDimensions);

    /** @type {Array<object>} */
    this.moves = [];
    this._moveIndex = 0;

    this.isRunning = false;
    this.currentF = DEFAULT_FEEDRATE_MM_MIN;

    // G92 virtual-zero offsets
    this._offsetX = 0;
    this._offsetY = 0;
    this._offsetZ = 0;

    // Live filament renderer (injected by startLiveVisualization)
    this._filamentRenderer = null;

    // Last-run statistics
    this.stats = null;

    // Legacy path array kept for visualizePath() backward compat
    this.path = [];

    console.log('PrintingMotion ready.');
    console.log(`   Bed in env: ${this.bedWidth}×${this.bedDepth} mm  |  placement: ${this.placement}`);
    console.log(`   Manual maxTravel: X=${xAxis.maxTravel}  Y=${yAxis.maxTravel}  Z=${zAxis.maxTravel}`);
  }

  // ── Move list ───────────────────────────────────────────────────────────────

  /**
   * Loads a G-code-style move list, replacing any previous list.
   *
   * @param {Array<{ cmd: string, X?: number, Y?: number, Z?: number, F?: number }>} moveList
   * @returns {this}  Chainable.
   */
  loadMoves(moveList) {
    this.moves = moveList.map((m) => ({ ...m }));
    this._syncLegacyPath();
    console.log(`Loaded ${this.moves.length} moves.`);
    return this;
  }

  /**
   * Backward-compatible loader for raw `{ x, y, z, speed }` objects.
   * Converts to G1 internally.
   *
   * @param {Array<{ x?: number, y?: number, z?: number, speed?: number }>} moves
   * @returns {this}
   */
  loadCustomPath(moves) {
    return this.loadMoves(
      moves.map((m) => ({
        cmd: 'G1',
        X: m.x ?? 0,
        Y: m.y ?? 0,
        Z: m.z ?? 0,
        F: m.speed != null ? m.speed * 60 : this.currentF,
      })),
    );
  }

  // ── Execution ───────────────────────────────────────────────────────────────

  /**
   * Executes the loaded move list sequentially.
   * Awaits each move's duration before proceeding to the next.
   *
   * @returns {Promise<void>}
   */
  async executePath() {
    if (this.moves.length === 0) {
      console.warn('executePath(): no moves loaded — call loadMoves() first.');
      return;
    }
    if (this.isRunning) {
      console.warn('executePath(): already running — call stop() first.');
      return;
    }

    this.isRunning = true;
    this._moveIndex = 0;
    this._offsetX = 0;
    this._offsetY = 0;
    this._offsetZ = 0;

    // added
    this._moveIndex = 0;
    this._lastE = undefined;

    // Clear previous filament and start fresh for this run
    this._filamentRenderer?.reset();

    const startTime = Date.now();
    let curX = 0, curY = 0, curZ = 0;

    console.log(`Executing ${this.moves.length} moves…`);

    for (let i = 0; i < this.moves.length; i++) {
      if (!this.isRunning) {
        console.log(`Execution halted at move ${this._moveIndex}`);
        break;
      }

      const move = this.moves[i];
      const cmd = (move.cmd ?? 'G1').toUpperCase();

      //  Handle the dynamic width/height overrides
      if (cmd === 'SET_HEIGHT') {
        this._filamentRenderer?.setHeight(move.value);
        continue; // Skip the rest of the loop (no motor movement)
      }

      if (cmd === 'SET_WIDTH') {
        this._filamentRenderer?.setWidth(move.value);
        continue; // Skip the rest of the loop (no motor movement)
      }

      // ── G28: Home ─────────────────────────────────────────────────────────
      if (cmd === 'G28') {
        const homeX = move.X !== undefined;
        const homeY = move.Y !== undefined;
        const homeZ = move.Z !== undefined;
        const homeAll = !homeX && !homeY && !homeZ;

        if (homeAll || homeX) { this.xAxis.moveToPosition(0, HOME_DURATION_MS); curX = 0; }
        if (homeAll || homeY) { this.yAxis.moveToPosition(0, HOME_DURATION_MS); curY = 0; }
        if (homeAll || homeZ) { this.zAxis.moveToPosition(0, HOME_DURATION_MS); curZ = 0; }

        await this._delay(HOME_DURATION_MS + HOME_SETTLE_MS);

        if (homeAll || homeX) this.xAxis.setPosition(0);
        if (homeAll || homeY) this.yAxis.setPosition(0);
        if (homeAll || homeZ) this.zAxis.setPosition(0);

        this._filamentRenderer?.appendBreak();

        const axes = homeAll
          ? 'all'
          : [homeX && 'X', homeY && 'Y', homeZ && 'Z'].filter(Boolean).join('');
        console.log(`G28 — homed ${axes}`);
        continue;
      }

      // ── G92: Set virtual zero ──────────────────────────────────────────────
      if (cmd === 'G92') {
        if (move.X !== undefined) { this._offsetX = curX - move.X; curX = move.X; }
        if (move.Y !== undefined) { this._offsetY = curY - move.Y; curY = move.Y; }
        if (move.Z !== undefined) { this._offsetZ = curZ - move.Z; curZ = move.Z; }

        //  Use move.E, not params.E
        if (move.E !== undefined) {
          this._lastE = move.E;
        }
        continue;
      }

      // ── G0 / G1: Move ─────────────────────────────────────────────────────
      if (cmd === 'G0' || cmd === 'G1') {
        if (move.F !== undefined) this.currentF = move.F;

        const targX = move.X !== undefined ? move.X : curX;
        const targY = move.Y !== undefined ? move.Y : curY;
        const targZ = move.Z !== undefined ? move.Z : curZ;

        const adjX = targX + this._offsetX;
        const adjY = targY + this._offsetY;
        const adjZ = targZ + this._offsetZ;

        const duration = this._moveDuration(
          adjX - (curX + this._offsetX),
          adjY - (curY + this._offsetY),
          adjZ - (curZ + this._offsetZ),
        );

        this.xAxis.moveToPosition(this._mapX(adjX), duration);
        this.yAxis.moveToPosition(this._mapY(adjY), duration);
        this.zAxis.moveToPosition(this._mapZ(adjZ), duration);

        await this._delay(duration);

        this.xAxis.setPosition(this._mapX(adjX));
        this.yAxis.setPosition(this._mapY(adjY));
        this.zAxis.setPosition(this._mapZ(adjZ));

        if (this._filamentRenderer) {
          //  Use move.E
          const hasE = move.E !== undefined;
          const isSmartFile = this._lastE !== undefined;
          let isPrinting = false;

          if (isSmartFile) {
            //  Compare move.E against this._lastE
            isPrinting = (cmd === 'G1') && hasE && (move.E > this._lastE);
          } else {
            isPrinting = (cmd === 'G1');
          }

          if (isPrinting) {
            this._filamentRenderer.appendPoint(adjX, adjY, adjZ);
          } else {
            this._filamentRenderer.appendBreak();
          }
        }

        //  Finally, update the tracker using move.E
        if (move.E !== undefined) {
          this._lastE = move.E;
        }

        curX = targX;
        curY = targY;
        curZ = targZ;
        continue;
      }

      console.log(`Skipping unknown command: ${cmd}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    this.isRunning = false;
    this._moveIndex = 0;
    this.stats = { moves: this.moves.length, elapsedSeconds: parseFloat(elapsed) };

    console.log(`Done: ${this.moves.length} moves in ${elapsed}s`);
  }

  /** Stops the running print at the current move. */
  stop() {
    if (!this.isRunning) { console.log('stop(): not running.'); return; }
    this.isRunning = false;
    console.log(`Stopped at move ${this._moveIndex}.`);
  }

  // ── Live filament ───────────────────────────────────────────────────────────

  /**
   * Attaches a `FilamentRenderer` instance so live filament is drawn
   * during `executePath()`.
   *
   * Call this BEFORE `executePath()`.
   *
   * @param {import('../../visualization/filament_renderer.js').FilamentRenderer} renderer
   * @returns {this}
   */
  setFilamentRenderer(renderer) {
    this._filamentRenderer = renderer;
    return this;
  }

  /** Detaches and clears the filament renderer. */
  clearFilamentRenderer() {
    this._filamentRenderer?.clear();
    this._filamentRenderer = null;
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  /**
   * Returns a snapshot of the current printing state.
   *
   * @returns {object}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalMoves: this.moves.length,
      currentMove: this._moveIndex,
      progress: this.moves.length > 0
        ? ((this._moveIndex / this.moves.length) * 100).toFixed(1) + '%'
        : '0%',
      feedrateMmMin: this.currentF,
      positions: {
        x: this.xAxis.getPosition(),
        y: this.yAxis.getPosition(),
        z: this.zAxis.getPosition(),
      },
      lastStats: this.stats,
    };
  }

  /** Logs the current status to the console in a readable format. */
  printStatus() {
    const s = this.getStatus();
    console.log('\n========== PRINTING STATUS ==========');
    console.log(`   Running  : ${s.isRunning}`);
    console.log(`   Progress : move ${s.currentMove} / ${s.totalMoves}  (${s.progress})`);
    console.log(`   Feedrate : ${s.feedrateMmMin} mm/min  (${(s.feedrateMmMin / 60).toFixed(1)} mm/s)`);
    console.log(`   Position : X=${s.positions.x.toFixed(2)}  Y=${s.positions.y.toFixed(2)}  Z=${s.positions.z.toFixed(2)}`);
    if (s.lastStats) {
      console.log(`   Last run : ${s.lastStats.moves} moves in ${s.lastStats.elapsedSeconds}s`);
    }
    console.log('=====================================\n');
  }

/**
   * Calculates bed size AND world position to align G-code (0,0)
   * with the front-left corner of the 'Tisch' mesh.
   */
  _initBedDimensions(loader, manualDims) {
    if (loader) {
      const bedMesh = loader.findPartByName('Tisch');
      if (bedMesh) {
        const box = new THREE.Box3().setFromObject(bedMesh);
        
        // 1. Get the Size
        const size = new THREE.Vector3();
        box.getSize(size);
        this.bedWidth = size.x * 1000;
        this.bedDepth = size.z * 1000;

        // 2. Get the "Real World" Corner Position (Virtual 0,0)
        // In Three.js, the front-left corner is usually min x and max z 
        // OR min x and min z depending on your export orientation.
        this.bedWorldXMin = box.min.x; 
        this.bedWorldZMin = box.min.z;

        console.log(`Bed World Origin (0,0) set to: X=${this.bedWorldXMin}, Z=${this.bedWorldZMin}`);
        return;
      }
    }

    // Fallback
    this.bedWidth = manualDims?.width ?? this.xAxis.maxTravel;
    this.bedDepth = manualDims?.depth ?? this.yAxis.maxTravel;
    this.bedWorldXMin = 0;
    this.bedWorldZMin = 0;
  }

  // ── Coordinate mapping ──────────────────────────────────────────────────────

// --- FIXED COORDINATE MAPPING ---

  /**
   * Maps G-code X to motor position.
   * Fixed 'center' logic: shifts the coordinate by half the bed width.
   */
  _mapX(gcodeX) {
    let val = gcodeX;
    if (this.placement === 'center') {
      val += this.bedWidth / 2;
    }
    // Clamp to bed and then scale to motor travel
    const clamped = Math.max(0, Math.min(val, this.bedWidth));
    return (clamped / this.bedWidth) * this.xAxis.maxTravel;
  }

  /**
   * Maps G-code Y to motor position.
   * Fixed 'center' logic: shifts the coordinate by half the bed depth.
   */
  _mapY(gcodeY) {
    let val = gcodeY;
    if (this.placement === 'center') {
      val += this.bedDepth / 2;
    }
    const clamped = Math.max(0, Math.min(val, this.bedDepth));
    return (clamped / this.bedDepth) * this.yAxis.maxTravel;
  }

  /**
   * Maps G-code Z (1:1 relationship with travel).
   */
  _mapZ(gcodeZ) {
    // No ratio needed for Z, just physical clamping
    return Math.max(0, Math.min(gcodeZ, this.zAxis.maxTravel));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Calculates the move duration in ms from a 3D displacement vector and the
   * current feedrate, scaled by `speedMultiplier`.
   *
   * Returns at least `MIN_MOVE_DURATION_MS` to prevent zero-duration frames.
   *
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   * @returns {number} Duration in ms.
   */
  _moveDuration(dx, dy, dz) {
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const speedMmS = (this.currentF / 60) * this.speedMultiplier;
    return Math.max(MIN_MOVE_DURATION_MS, (dist / speedMmS) * 1000);
  }

  /**
   * Keeps the legacy `this.path` array in sync with the move list so that
   * any existing `visualizePath()` calls continue to work unchanged.
   */
  _syncLegacyPath() {
    this.path = this.moves
      .filter((m) => m.cmd === 'G0' || m.cmd === 'G1')
      .map((m) => ({ x: m.X ?? 0, y: m.Y ?? 0, z: m.Z ?? 0 }));
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
