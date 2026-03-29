/**
 * @file printing_motion.js
 * @description Executes a full G-code move list on the three printer axes,
 * drives live filament rendering with correct extrusion/travel detection,
 * and applies all printer state commands.
 *
 * Filament rendering contract
 * ───────────────────────────
 * After every axis setPosition() call (which snaps the 3D model nodes to
 * their final positions), PrintingMotion calls either:
 *   filamentRenderer.appendPoint()   — nozzle is extruding
 *   filamentRenderer.appendBreak()   — travel / retract / home
 *
 * appendPoint() takes NO coordinates — the renderer reads the nozzle world
 * position directly from the 3D scene via updateWorldMatrix + Box3. This is
 * the only reliable source of truth because axis motor-mm values map through
 * complex local-space transforms that differ per axis.
 *
 * Extrusion detection (PrusaSlicer retraction pattern)
 * ────────────────────────────────────────────────────
 * PrusaSlicer retracts before every travel:
 *   G1 E-2 F2400   ; retract 2mm
 *   G92 E0          ; reset E register to 0
 *   G1 X.. Y..      ; travel (no E)
 *   G1 E2 F2400     ; un-retract (E 0→2, no XY) ← NOT printing
 *   G1 X.. Y.. E2.4 ; actual print move          ← IS  printing
 *
 * Rules applied in _isExtruding():
 *   1. G0 → always travel
 *   2. No E parameter → travel
 *   3. E not increasing → retraction during move
 *   4. No XY displacement → pure E move (retract / un-retract)
 *   5. Remaining retract budget > 0 → still un-retracting, not printing
 *   6. All above clear → extruding ✓
 *
 * @module printer_manager/motion/printing_motion
 */

import { PRINTER_CONFIG, getCurrentState } from '../../config/printer_config.js';
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
   * @param {import('./x_axis.js').XAxisMotion}  xAxis
   * @param {import('./y_axis.js').YAxisMotion}  yAxis
   * @param {import('./z_axis.js').ZAxisMotion}  zAxis
   * @param {object}  [options]
   * @param {'corner'|'center'} [options.placement]
   * @param {number}  [options.speedMultiplier]
   * @param {object}  [options.modelLoader]
   * @param {{ width: number, depth: number }} [options.bedDimensions]
   */
  constructor(xAxis, yAxis, zAxis, options = {}) {
    this.xAxis = xAxis;
    this.yAxis = yAxis;
    this.zAxis = zAxis;

    this.placement       = options.placement       ?? DEFAULT_PLACEMENT;
    this.speedMultiplier = options.speedMultiplier ?? DEFAULT_SPEED_MULTIPLIER;

    this._initBedDimensions(options.modelLoader, options.bedDimensions);

    this.moves      = [];
    this._moveIndex = 0;
    this.isRunning  = false;
    this.currentF   = DEFAULT_FEEDRATE_MM_MIN;

    // G92 virtual-zero offsets
    this._offsetX = 0;
    this._offsetY = 0;
    this._offsetZ = 0;

    // E tracking
    this._lastE         = undefined;
    this._retractBudget = 0;

    this._state = getCurrentState();

    /** @type {import('../../visualization/filament_renderer.js').FilamentRenderer | null} */
    this._filamentRenderer = null;

    this.onStateChange    = null;
    this.onProgressChange = null;
    this.onLayerChange    = null;

    this.stats = null;
    this.path  = [];

    console.log('PrintingMotion ready.');
    console.log(`   Bed: ${this.bedWidth}×${this.bedDepth} mm  |  placement: ${this.placement}`);
    console.log(`   maxTravel: X=${xAxis.maxTravel}  Y=${yAxis.maxTravel}  Z=${zAxis.maxTravel}`);
  }

  // ── Move list ───────────────────────────────────────────────────────────────

  loadMoves(moveList) {
    this.moves = moveList.map((m) => ({ ...m }));
    this._syncLegacyPath();
    console.log(`Loaded ${this.moves.length} moves.`);
    return this;
  }

  loadCustomPath(moves) {
    return this.loadMoves(
      moves.map((m) => ({
        cmd: 'G1',
        X: m.x ?? 0, Y: m.y ?? 0, Z: m.z ?? 0,
        F: m.speed != null ? m.speed * 60 : this.currentF,
      })),
    );
  }

  // ── Execution ───────────────────────────────────────────────────────────────

  async executePath() {
    if (this.moves.length === 0) { console.warn('executePath(): no moves.'); return; }
    if (this.isRunning)          { console.warn('executePath(): already running.'); return; }

    this.isRunning      = true;
    this._moveIndex     = 0;
    this._offsetX       = 0;
    this._offsetY       = 0;
    this._offsetZ       = 0;
    this._lastE         = undefined;
    this._retractBudget = 0;
    this._state         = getCurrentState();
    this._state.status.isPrinting = true;

    this._filamentRenderer?.reset();

    const startTime = Date.now();
    let curX = 0, curY = 0, curZ = 0;

    console.log(`Executing ${this.moves.length} moves…`);

    for (let i = 0; i < this.moves.length; i++) {
      if (!this.isRunning) break;

      this._moveIndex = i;
      const move = this.moves[i];
      const cmd  = (move.cmd ?? 'G1').toUpperCase();

      if (i % 500 === 0 && this.onProgressChange) {
        this.onProgressChange((i / this.moves.length) * 100);
      }

      // ── Slicer pseudo-commands ─────────────────────────────────────────
      if (cmd === 'SET_HEIGHT') { this._filamentRenderer?.setHeight(move.value); continue; }
      if (cmd === 'SET_WIDTH')  { this._filamentRenderer?.setWidth(move.value);  continue; }
      if (cmd === 'SET_LAYER')  { this.onLayerChange?.(move.value); continue; }
      if (cmd === 'SET_TYPE')   { continue; }

      // ── G4: Dwell ──────────────────────────────────────────────────────
      if (cmd === 'G4') {
        const ms = Math.min(move.dwell ?? 0, 2000) / this.speedMultiplier;
        if (ms > 0) await this._delay(ms);
        continue;
      }

      if (cmd === 'G20' || cmd === 'G21') continue;

      // ── G28: Home ──────────────────────────────────────────────────────
      if (cmd === 'G28') {
        const homeX   = move.X !== undefined;
        const homeY   = move.Y !== undefined;
        const homeZ   = move.Z !== undefined;
        const homeAll = !homeX && !homeY && !homeZ;

        if (homeAll || homeX) { this.xAxis.moveToPosition(0, HOME_DURATION_MS); curX = 0; }
        if (homeAll || homeY) { this.yAxis.moveToPosition(0, HOME_DURATION_MS); curY = 0; }
        if (homeAll || homeZ) { this.zAxis.moveToPosition(0, HOME_DURATION_MS); curZ = 0; }

        await this._delay(HOME_DURATION_MS + HOME_SETTLE_MS);

        if (homeAll || homeX) this.xAxis.setPosition(0);
        if (homeAll || homeY) this.yAxis.setPosition(0);
        if (homeAll || homeZ) this.zAxis.setPosition(0);

        this._filamentRenderer?.appendBreak();
        this._state.status.isHomed = true;
        this._emitState();
        continue;
      }

      if (cmd === 'G29') { this._state.status.isHomed = true; this._emitState(); continue; }

      // ── G92: Set virtual zero ──────────────────────────────────────────
      if (cmd === 'G92') {
        if (move.X !== undefined) { this._offsetX = curX - move.X; curX = move.X; }
        if (move.Y !== undefined) { this._offsetY = curY - move.Y; curY = move.Y; }
        if (move.Z !== undefined) { this._offsetZ = curZ - move.Z; curZ = move.Z; }

        if (move.E !== undefined) {
          // The E diff before reset tells us the retract amount
          // e.g. lastE was 16.74, retracted to 14.74, G92 E0 → budget = 2
          // e.g. lastE was -2, G92 E0 → budget = 2
          if (this._lastE !== undefined) {
            const diff = this._lastE - move.E;
            // diff > 0 means we were behind (retracted), budget = that amount
            this._retractBudget = diff > 0 ? diff : 0;
          } else {
            this._retractBudget = 0;
          }
          this._lastE = move.E;
        }
        continue;
      }

      // ── Temperature & fan ──────────────────────────────────────────────
      if (cmd === 'M104' || cmd === 'M109') {
        this._state.temperature.nozzle.target  = move.temp ?? 0;
        this._state.temperature.nozzle.current = move.temp ?? 0;
        this._state.status.isHeating = (cmd === 'M109');
        this._emitState();
        if (cmd === 'M109') await this._delay(50);
        this._state.status.isHeating = false;
        continue;
      }
      if (cmd === 'M140' || cmd === 'M190') {
        this._state.temperature.bed.target  = move.temp ?? 0;
        this._state.temperature.bed.current = move.temp ?? 0;
        this._state.status.isHeating = (cmd === 'M190');
        this._emitState();
        if (cmd === 'M190') await this._delay(50);
        this._state.status.isHeating = false;
        continue;
      }
      if (cmd === 'M106') { this._state.cooling.fanSpeed = move.fanSpeed ?? 100; this._emitState(); continue; }
      if (cmd === 'M107') { this._state.cooling.fanSpeed = 0; this._emitState(); continue; }

      // ── Motion parameter commands ──────────────────────────────────────
      if (cmd === 'M204') {
        if (move.printAccel !== undefined) this._state.motion.acceleration = move.printAccel;
        this._emitState(); continue;
      }
      if (cmd === 'M205') {
        if (move.jerkX !== undefined) this._state.motion.jerk.x = move.jerkX;
        if (move.jerkY !== undefined) this._state.motion.jerk.y = move.jerkY;
        this._emitState(); continue;
      }
      if (cmd === 'M220') {
        this._state.motion.speedMultiplier = move.speedPct ?? 100;
        this.speedMultiplier = DEFAULT_SPEED_MULTIPLIER * ((move.speedPct ?? 100) / 100);
        this._emitState(); continue;
      }
      if (cmd === 'M221') {
        this._state.extrusion.multiplier = (move.flowPct ?? 100) / 100;
        this._emitState(); continue;
      }
      if (cmd === 'M0' || cmd === 'M1') {
        this._filamentRenderer?.appendBreak();
        await this._delay(200);
        continue;
      }
      if (cmd === 'M84') continue;

      // ── G0 / G1: Move ──────────────────────────────────────────────────
      if (cmd === 'G0' || cmd === 'G1') {
        if (move.F !== undefined) this.currentF = move.F;

        const targX = move.X !== undefined ? move.X : curX;
        const targY = move.Y !== undefined ? move.Y : curY;
        const targZ = move.Z !== undefined ? move.Z : curZ;

        const adjX = targX + this._offsetX;
        const adjY = targY + this._offsetY;
        const adjZ = targZ + this._offsetZ;

        // XY displacement for extrusion detection
        const dxGcode  = adjX - (curX + this._offsetX);
        const dyGcode  = adjY - (curY + this._offsetY);
        const dzGcode  = adjZ - (curZ + this._offsetZ);
        const hasXYMov = (Math.abs(dxGcode) + Math.abs(dyGcode)) > 0.001;

        const duration = this._moveDuration(dxGcode, dyGcode, dzGcode);

        // ── Animate axes (linear interpolation for accurate paths) ────
        this.xAxis.moveToPositionLinear(this._mapX(adjX), duration);
        this.yAxis.moveToPositionLinear(this._mapY(adjY), duration);
        this.zAxis.moveToPositionLinear(this._mapZ(adjZ), duration);

        // ── Filament: record start & end points only ─────────────────
        // Axes move linearly, so the path between start and end is a
        // straight line — intermediate samples are unnecessary.
        const extruding = this._isExtruding(cmd, move, hasXYMov);
        if (this._filamentRenderer) {
          if (extruding) {
            // Record start point, wait for move, record end point
            this._filamentRenderer.appendPoint();
            await this._delay(duration);
            this._filamentRenderer.appendPoint();
          } else {
            // For travel moves, wait full duration and add break
            await this._delay(duration);
            this._filamentRenderer.appendBreak();
          }
        } else {
          await this._delay(duration);
        }

        // Snap axes to exact final position to eliminate any drift
        this.xAxis.setPosition(this._mapX(adjX));
        this.yAxis.setPosition(this._mapY(adjY));
        this.zAxis.setPosition(this._mapZ(adjZ));

        // Update E tracking
        if (move.E !== undefined) {
          const eDelta = move.E - (this._lastE ?? move.E);
          if (eDelta > 0 && this._retractBudget > 0) {
            this._retractBudget = Math.max(0, this._retractBudget - eDelta);
          }
          this._lastE = move.E;
        }

        this._state.position.absolute = {
          x: adjX, y: adjY, z: adjZ, e: this._lastE ?? 0,
        };
        this._state.motion.feedrate = this.currentF;

        curX = targX;
        curY = targY;
        curZ = targZ;
        continue;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    this.isRunning = false;
    this._state.status.isPrinting = false;
    this.stats = { moves: this.moves.length, elapsedSeconds: parseFloat(elapsed) };
    this._emitState();
    this.onProgressChange?.(100);
    console.log(`Done: ${this.moves.length} moves in ${elapsed}s`);
  }

  // ── Extrusion detection ─────────────────────────────────────────────────────

  /**
   * Returns true only when the move should deposit real filament.
   *
   * @param {string}  cmd
   * @param {object}  move
   * @param {boolean} hasXYMov  true if the move has XY displacement
   */
  _isExtruding(cmd, move, hasXYMov) {
    if (cmd === 'G0')             return false;  // rapid — never extrudes
    if (move.E === undefined)     return false;  // no E parameter
    if (!hasXYMov)                return false;  // pure retract / un-retract

    const eDelta = move.E - (this._lastE ?? move.E);
    if (eDelta <= 0)              return false;  // retracting during XY move

    // Un-retract budget: consumed by G1 moves that un-retract after G92 reset
    if (this._retractBudget > 0) return false;

    return true;
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log(`Stopped at move ${this._moveIndex}.`);
  }

  // ── Filament renderer ───────────────────────────────────────────────────────

  /**
   * Attaches a FilamentRenderer.
   * No scale injection needed — the renderer reads world positions from scene.
   * @param {import('../../visualization/filament_renderer.js').FilamentRenderer} renderer
   * @returns {this}
   */
  setFilamentRenderer(renderer) {
    this._filamentRenderer = renderer;
    return this;
  }

  clearFilamentRenderer() {
    this._filamentRenderer?.clear();
    this._filamentRenderer = null;
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  getPrinterState() { return JSON.parse(JSON.stringify(this._state)); }

  getStatus() {
    return {
      isRunning:       this.isRunning,
      totalMoves:      this.moves.length,
      currentMove:     this._moveIndex,
      progress:        this.moves.length > 0
        ? ((this._moveIndex / this.moves.length) * 100).toFixed(1) + '%' : '0%',
      feedrateMmMin:   this.currentF,
      speedMultiplier: this.speedMultiplier,
      positions: {
        x: this.xAxis.getPosition(),
        y: this.yAxis.getPosition(),
        z: this.zAxis.getPosition(),
      },
      temperature: this._state.temperature,
      cooling:     this._state.cooling,
      lastStats:   this.stats,
    };
  }

  printStatus() {
    const s = this.getStatus();
    console.log('\n========== PRINTING STATUS ==========');
    console.log(`   Running  : ${s.isRunning}`);
    console.log(`   Progress : ${s.currentMove} / ${s.totalMoves}  (${s.progress})`);
    console.log(`   Feedrate : ${s.feedrateMmMin} mm/min`);
    console.log(`   Speed×   : ${s.speedMultiplier}×`);
    console.log(`   Hotend   : ${s.temperature.nozzle.current} °C`);
    console.log(`   Bed      : ${s.temperature.bed.current} °C`);
    if (s.lastStats) console.log(`   Last run : ${s.lastStats.moves} moves in ${s.lastStats.elapsedSeconds}s`);
    console.log('=====================================\n');
  }

  // ── Bed dimensions ──────────────────────────────────────────────────────────

  _initBedDimensions(loader, manualDims) {

    if (loader) {
      const bedMesh = loader.findPartByName?.('Tisch');
      if (bedMesh) {
        const box  = new THREE.Box3().setFromObject(bedMesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        this.bedWidth     = (size.x) * 1000;   // scene-units → mm
        this.bedDepth     = (size.z) * 1000;   // scene-units → mm
        this.bedWorldXMin = box.min.x;
        this.bedWorldZMin = box.min.z;
        console.log(
          `Bed from model: ${this.bedWidth.toFixed(0)}×${this.bedDepth.toFixed(0)} mm` +
          `  (scene size ${size.x.toFixed(3)}×${size.z.toFixed(3)} units)`,
        );
        return;
      }
    }
    // Fallback: use config values (updated for 350×350 bed)
    this.bedWidth     = manualDims?.width ?? PRINTER_CONFIG.hardware.bed.width;
    this.bedDepth     = manualDims?.depth ?? PRINTER_CONFIG.hardware.bed.depth;
    this.bedWorldXMin = 0;
    this.bedWorldZMin = 0;
    console.log(`Bed from config: ${this.bedWidth}×${this.bedDepth} mm`);
  }

  // ── Coordinate mapping ──────────────────────────────────────────────────────

  /** G-code X (mm) → axis motor position (mm, clamped to build volume) */
  _mapX(gcodeX) {
    let v = gcodeX;
    if (this.placement === 'center') v += this.bedWidth / 2;
    return (Math.max(0, Math.min(v, this.bedWidth))  / this.bedWidth)  * this.xAxis.maxTravel;
  }

  /** G-code Y (mm) → axis motor position (mm) */
  _mapY(gcodeY) {
    let v = gcodeY;
    if (this.placement === 'center') v += this.bedDepth / 2;
    return (Math.max(0, Math.min(v, this.bedDepth))  / this.bedDepth)  * this.yAxis.maxTravel;
  }

  /** G-code Z (mm) → axis motor position (mm, 1:1) */
  _mapZ(gcodeZ) {
    return Math.max(0, Math.min(gcodeZ, this.zAxis.maxTravel));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _moveDuration(dx, dy, dz) {
    // Ensure we account for actual travel distance and minimum move time
    // even if distance is very small (to prevent instant moves that break animation)
    const dist     = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.001) {
      // Minimal move — still needs some time for animations to complete
      return Math.max(MIN_MOVE_DURATION_MS, 20);
    }
    
    // Convert feedrate from mm/min to mm/ms for accurate timing
    const speedMmS  = (this.currentF / 60) * this.speedMultiplier;
    const speedMmMs = speedMmS / 1000;
    
    // Ensure minimum duration for animation to be visible
    const calculatedDuration = (dist / speedMmMs);
    return Math.max(MIN_MOVE_DURATION_MS, calculatedDuration);
  }

  _syncLegacyPath() {
    this.path = this.moves
      .filter((m) => m.cmd === 'G0' || m.cmd === 'G1')
      .map((m)   => ({ x: m.X ?? 0, y: m.Y ?? 0, z: m.Z ?? 0 }));
  }

  _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  _emitState() { this.onStateChange?.(JSON.parse(JSON.stringify(this._state))); }
}
