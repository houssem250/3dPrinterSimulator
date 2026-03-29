/**
 * @file printing_examples.js
 * @description Developer console helpers for running print simulations.
 *
 * This file was moved from `printer_manager/motion/printing_examples.js`
 * to `dev/printing_examples.js`. It is imported only via a dynamic
 * `import()` when `IS_DEV = true` in `main.js`, so it is never bundled
 * into a production build.
 *
 * Usage (browser console)
 * ───────────────────────
 *   app.examples.square()
 *   app.examples.circle()
 *   app.examples.tower()
 *   app.examples.manualMoves()
 *   app.examples.fromString(gcode)
 *   app.examples.fromURL(url)
 *   app.examples.speed(5)
 *   app.examples.placement('center')
 *   app.examples.status()
 *   app.examples.stop()
 *   app.examples.clear()
 *   app.examples.dbg.inspect('X_axis')
 *   app.examples.dbg.stats()
 *
 * @module dev/printing_examples
 */

import * as THREE             from 'three';
import { AppContext }         from '../app_context.js';
import { GCodeLoader }        from '../gcode/gcode_loader.js';
import { PathGenerators }     from '../gcode/path_generators.js';
import { FilamentRenderer }   from '../visualization/filament_renderer.js';
import { ModelDebugger }      from '../model/model_debugger.js';

export class PrintingExamples {

  constructor() {
    // Lazily created on first use so construction doesn't fail if the
    // model hasn't finished loading.
    this._dbg = null;

    // Single FilamentRenderer reused across runs — reset() clears it each time
    this._renderer = null;

    console.log('PrintingExamples ready. Available commands:');
    console.log('   app.examples.square()        — 2-layer square');
    console.log('   app.examples.circle()        — 2-layer circle');
    console.log('   app.examples.tower()         — calibration tower');
    console.log('   app.examples.manualMoves()   — raw move list');
    console.log('   app.examples.fromString(gc)  — parse a G-code string');
    console.log('   app.examples.fromURL(url)    — load a .gcode file');
    console.log('   app.examples.dbg             — model inspection tools');
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  get _printer() {
    if (!AppContext.printer) throw new Error('printer not ready — wait for model to load.');
    return AppContext.printer;
  }

  get _scene() {
    if (!AppContext.scene) throw new Error('scene not available.');
    return AppContext.scene;
  }

  /**
   * Lazily initialised `ModelDebugger` instance.
   * @type {ModelDebugger}
   */
  get dbg() {
    if (!this._dbg) {
      if (!AppContext.modelLoader) throw new Error('modelLoader not ready.');
      this._dbg = new ModelDebugger(AppContext.modelLoader);
    }
    return this._dbg;
  }

  // ── Built-in print examples ─────────────────────────────────────────────────

  /** Prints a square at default centre with given side length and layers. */
  square(startX = undefined, startY = undefined, size = 40, layers = 2) {
    const moves = PathGenerators.square(startX, startY, size, layers);
    this._runMoves(moves);
  }

  /** Prints a circle at default centre with given radius and layers. */
  circle(cx = undefined, cy = undefined, radius = 30, layers = 2) {
    const moves = PathGenerators.circle(cx, cy, radius, layers);
    this._runMoves(moves);
  }
  /** Print a calibration tower at default centre */
  tower(cx = undefined, cy = undefined, size = 40, layers = 10, layerHeight = undefined, speed = 40) {
    const moves = PathGenerators.tower(cx, cy, size, layers, layerHeight, speed);
    console.log(`Tower: size=${size} mm  layers=${layers}  height=${(layers * (layerHeight||0.2)).toFixed(2)} mm`);
    this._runMoves(moves);
  }

  // ── Manual move list ────────────────────────────────────────────────────────

  manualMoves() {
    this._runMoves([
      { cmd: 'G28' },
      { cmd: 'G92', Z: 0 },
      { cmd: 'G0',  X: 50,  Y: 50,  Z: 5,   F: 6000 },
      { cmd: 'G1',  X: 50,  Y: 50,  Z: 0.2, F: 1800 },
      { cmd: 'G1',  X: 150, Y: 50,  Z: 0.2, F: 1800 },
      { cmd: 'G1',  X: 150, Y: 150, Z: 0.2, F: 1800 },
      { cmd: 'G1',  X: 50,  Y: 150, Z: 0.2, F: 1800 },
      { cmd: 'G1',  X: 50,  Y: 50,  Z: 0.2, F: 1800 },
      { cmd: 'G0',  X: 50,  Y: 50,  Z: 1,   F: 6000 },
      { cmd: 'G1',  X: 50,  Y: 50,  Z: 0.4, F: 1800 },
      { cmd: 'G1',  X: 150, Y: 50,  Z: 0.4, F: 1800 },
      { cmd: 'G1',  X: 150, Y: 150, Z: 0.4, F: 1800 },
      { cmd: 'G1',  X: 50,  Y: 150, Z: 0.4, F: 1800 },
      { cmd: 'G1',  X: 50,  Y: 50,  Z: 0.4, F: 1800 },
      { cmd: 'G28' },
    ]);
  }

  // ── G-code string ───────────────────────────────────────────────────────────

  fromString(gcode = null) {
    const defaultGcode = `
G28
G92 E0
G1 Z5 F3000
G1 X50 Y50 Z0.2 F1800
G1 X150 Y50 F1800
G1 X150 Y150 F1800
G1 X50 Y150 F1800
G1 X50 Y50 F1800
G0 Z1 F6000
G1 X50 Y50 Z0.4 F1800
G1 X150 Y50 F1800
G1 X150 Y150 F1800
G1 X50 Y150 F1800
G1 X50 Y50 F1800
G28
    `.trim();

    const loader = new GCodeLoader();
    loader.parse(gcode ?? defaultGcode);
    loader.summary();
    this._runMoves(loader.moves);
  }

  // ── From URL ────────────────────────────────────────────────────────────────

  fromURL(url = 'models/Jellyfish_Fidget.gcode') {
    new GCodeLoader()
      .loadFromURL(url)
      .then((loader) => {
        loader.summary();
        this._runMoves(loader.moves);
      })
      .catch((err) => console.error('Failed to load G-code:', err.message));
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /** Logs current printing status. */
  status() { this._printer.printStatus(); }

  /**
   * Stops the current print.
   * @param {boolean} [andClear=false]  Also remove partial filament if true.
   */
  stop(andClear = false) {
    this._printer.stop();
    if (andClear) this._filamentRenderer.clear();
  }

  /**
   * Removes the live filament line from the scene.
   * Safe to call at any time.
   */
  clear() {
    this._filamentRenderer.clear();
  }

  /**
   * Sets the simulation speed multiplier.
   * @param {number} multiplier  1 = real speed, 5 = 5× faster.
   */
  speed(multiplier = 1) {
    if (typeof multiplier !== 'number' || multiplier <= 0) {
      console.warn('speed(): pass a positive number, e.g. app.examples.speed(5)');
      return;
    }
    this._printer.speedMultiplier = multiplier;
    console.log(`Speed multiplier: ${multiplier}×`);
  }

  /**
   * Switches the G-code coordinate origin.
   * @param {'corner'|'center'} mode
   */
  placement(mode) {
    if (mode !== 'corner' && mode !== 'center') {
      console.warn('placement(): use "corner" or "center"');
      return;
    }
    this._printer.placement = mode;
    console.log(`Placement: ${mode}`);
  }

  /**
   * Logs where the bed and nozzle currently are in world space.
   * Useful for calibrating coordinate mappings.
   */
  where() {
    const { modelLoader } = AppContext;
    if (!modelLoader) { console.warn('modelLoader not ready.'); return; }

    const bed    = modelLoader.findPartByName('Tisch');
    const nozzle = modelLoader.findPartByName('Druckkopf');

    if (bed) {
      bed.updateWorldMatrix(true, true);
      const b      = new THREE.Box3().setFromObject(bed);
      const centre = new THREE.Vector3().addVectors(b.min, b.max).multiplyScalar(0.5);
      console.log('Bed world min   :', b.min);
      console.log('Bed world max   :', b.max);
      console.log('Bed world centre:', centre);
    } else {
      console.warn('Tisch not found.');
    }

    if (nozzle) {
      nozzle.updateWorldMatrix(true, true);
      const nb = new THREE.Box3().setFromObject(nozzle);
      console.log('Nozzle world centre:', new THREE.Vector3().addVectors(nb.min, nb.max).multiplyScalar(0.5));
      console.log('Nozzle tip Y       :', nb.min.y);
    } else {
      console.warn('Druckkopf not found.');
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Returns the shared FilamentRenderer, creating it lazily on first use.
   * Reused across all runs — executePath() calls reset() at the start of
   * each run to clear the previous mesh before drawing new filament.
   * @returns {FilamentRenderer}
   */
  get _filamentRenderer() {
    if (!this._renderer) {
      this._renderer = new FilamentRenderer(this._scene);
      this._printer.setFilamentRenderer(this._renderer);
    }
    return this._renderer;
  }

  /**
   * Guards against double-run, wires the shared renderer, and executes.
   * @param {object[]} moves
   */
  _runMoves(moves) {
    if (this._printer.isRunning) {
      console.warn('Already running. Call app.examples.stop() first.');
      return;
    }
    // Ensure the shared renderer is attached (idempotent if already set)
    this._printer.setFilamentRenderer(this._filamentRenderer);
    this._printer.loadMoves(moves).executePath();
  }
}
