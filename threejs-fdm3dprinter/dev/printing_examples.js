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
    // Current printer being targeted by the console
    this._targetId = 0;

    // Lazily created on first use
    this._dbg = null;

    console.log('PrintingExamples ready. Multi-printer support enabled.');
    console.log('   app.examples.target(id)      — switch active printer');
    console.log('   app.examples.square()        — 2-layer square');
    console.log('   app.examples.circle()        — 2-layer circle');
    console.log('   app.examples.tower()         — calibration tower');
    console.log('   app.examples.print()         — start simulation');
  }

  /**
   * Sets the target printer for subsequent commands.
   * @param {number} id 
   * @returns {this}
   */
  target(id) {
    if (!AppContext.printers[id]) {
      console.error(`Invalid printer ID: ${id}. Only [0..${AppContext.printers.length - 1}] exist.`);
      return this;
    }
    this._targetId = id;
    console.log(`🎯 Targeting Printer #${id} (${AppContext.printers[id].id})`);
    return this;
  }

  // ── Accessors (Printer Aware) ──────────────────────────────────────────────

  get _instance() {
    const p = AppContext.printers[this._targetId];
    if (!p) throw new Error(`Printer #${this._targetId} not found.`);
    return p;
  }

  get _standalone() {
    return this._instance.standalone;
  }

  get _filamentRenderer() {
    return this._instance.filament;
  }

  get _scene() {
    return AppContext.scene;
  }

  /**
   * Lazily initialised `ModelDebugger` instance for the current target.
   */
  get dbg() {
    // debugger always targets the current instance group
    return new ModelDebugger({
      _printerModel: this._instance.model
    });
  }

  // ── Built-in print examples ─────────────────────────────────────────────────

  /** Prints a square at default centre with given side length and layers. */
  square(startX = undefined, startY = undefined, size = 40, layers = 2) {
    const moves = PathGenerators.square(startX, startY, size, layers);
    this._runMoves(moves, false);
  }

  /** Prints a circle at default centre with given radius and layers. */
  circle(cx = undefined, cy = undefined, radius = 30, layers = 2) {
    const moves = PathGenerators.circle(cx, cy, radius, layers);
    this._runMoves(moves, false);
  }
  /** Print a calibration tower at default centre */
  tower(cx = undefined, cy = undefined, size = 40, layers = 10, layerHeight = undefined, speed = 40) {
    const moves = PathGenerators.tower(cx, cy, size, layers, layerHeight, speed);
    console.log(`Tower: size=${size} mm  layers=${layers}  height=${(layers * (layerHeight||0.2)).toFixed(2)} mm`);
    this._runMoves(moves, false);
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
    ], false);
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
    this._runMoves(loader.moves, false);
  }

  // ── From URL ────────────────────────────────────────────────────────────────

  fromURL(url = 'models/Jellyfish_Fidget.gcode') {
    new GCodeLoader()
      .loadFromURL(url)
      .then((loader) => {
        loader.summary();
        this._runMoves(loader.moves, false);
      })
      .catch((err) => console.error('Failed to load G-code:', err.message));
  }

  // ── Utilities ───────────────────────────────────────────────────────────────
  
  /** Starts the current standalone print. */
  print() {
    if (this._standalone.isRunning) {
      console.warn('Simulation is already running.');
      return;
    }
    if (this._standalone.moves.length === 0) {
      console.error('No moves loaded. Use fromURL() or fromString() first.');
      return;
    }
    this._standalone.start();
  }

  /** Pauses the current print. */
  pause() {
    this._standalone.pause();
  }

  /** Resumes a paused print. */
  resume() {
    this._standalone.resume();
  }

  /** Switches the target printer to Stream (MQTT) Mode */
  async stream() {
    const { mqttService } = await import('../src/services/MqttService.js');
    await this._instance.switchMode('stream', mqttService);
    console.log(`📡 Printer #${this._targetId} is now LISTENING for Live Stream Telemetry.`);
  }

  /** Switches the target printer to Standalone (Local G-code) Mode */
  async standalone() {
    await this._instance.switchMode('standalone');
    console.log(`🔌 Printer #${this._targetId} is now in STANDALONE mode.`);
  }

  /**
   * Stops the current print.
   * @param {boolean} [andClear=false]  Also remove partial filament if true.
   */
  stop(andClear = false) {
    this._standalone.stop();
    if (andClear) this.clear();
  }

  /** Alias for stop() */
  abort() {
    this.stop();
  }

  /**
   * Removes the live filament line from the scene.
   * Safe to call at any time.
   */
  clear() {
    this._filamentRenderer.clear();
  }

  /**
   * Stops, Clears bed, and Home axes.
   * @returns {Promise<void>}
   */
  /**
   * Stops, Clears bed, and Home axes.
   * @returns {Promise<void>}
   */
  async reset() {
    this.stop(true);
    // Queue a home move
    this._runMoves([{ cmd: 'G28' }]);
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
    this._standalone.speedMultiplier = multiplier * 100; // StandaloneProvider uses %
    console.log(`Speed multiplier: ${multiplier}×`);
  }

  placement(mode) {
    this._instance.state.placement = mode;
    console.log(`Placement: ${mode}`);
  }

  /**
   * Logs where the bed and nozzle currently are in world space.
   * Useful for calibrating coordinate mappings.
   */
  where() {
    const bed    = this._instance.findPart('Tisch');
    const nozzle = this._instance.findPart('Druckkopf');

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

  /**
   * Calculates the exact offset between the printed filament and the bed 
   * by comparing their bounding boxes.
   * 
   * Usage: 
   * 1. app.examples.square(0, 0, 350, 1)
   * 2. (Wait for it to finish)
   * 3. app.examples.calcOffset()
   */
  calcOffset() {
    console.log('\n--- 📏 Nozzle Offset Calibration ---');
    const bed = this._instance.findPart('Tisch');
    
    if (!bed) {
      console.error('Tisch (bed) not found.');
      return;
    }

    // Refresh world matrices
    AppContext.scene.updateMatrixWorld(true);

    const bedBox = new THREE.Box3().setFromObject(bed);
    
    // Get filament bounding box
    const filamentGroup = this._filamentRenderer._group;
    if (!filamentGroup || filamentGroup.children.length === 0) {
      console.warn('❌ No filament found! Please run `app.examples.square(0, 0, 350, 1)` first, let it finish, then run `app.examples.calcOffset()`.');
      return;
    }

    const filBox = new THREE.Box3().setFromObject(filamentGroup);

    console.log(`📦 Bed World Bounds   : X[${bedBox.min.x.toFixed(4)}, ${bedBox.max.x.toFixed(4)}]  Z[${bedBox.min.z.toFixed(4)}, ${bedBox.max.z.toFixed(4)}]`);
    console.log(`🟧 Print World Bounds : X[${filBox.min.x.toFixed(4)}, ${filBox.max.x.toFixed(4)}]  Z[${filBox.min.z.toFixed(4)}, ${filBox.max.z.toFixed(4)}]`);

    // The gap between the front-left of the bed and the front-left of the print
    const offsetXWorld = bedBox.min.x - filBox.min.x;
    const offsetZWorld = bedBox.min.z - filBox.min.z;
    
    // Convert to millimeter scale
    const suPerMm = this._filamentRenderer._bedWidthWorldUnits / 350.0; // Assuming 350mm bed
    const offsetX_mm = offsetXWorld / suPerMm;
    const offsetZ_mm = offsetZWorld / suPerMm;

    console.log(`\n📐 Calculated Offset (World Units) : X = ${offsetXWorld.toFixed(6)}, Z = ${offsetZWorld.toFixed(6)}`);
    console.log(`🛠️ Calculated Offset (Millimeters) : X = ${offsetX_mm.toFixed(3)} mm, Z = ${offsetZ_mm.toFixed(3)} mm`);
    
    console.log('\n💡 To fix this visual gap, we can subtract this offset directly from _nozzleWorldPos() in filament_renderer.js!');
  }

  // ── Private ─────────────────────────────────────────────────────────────────


  /**
   * Guards against double-run, wires the shared renderer, and executes.
   * @param {object[]} moves
   */
  _runMoves(moves, autoStart = false) {
    if (this._standalone.isRunning) {
      console.warn('Already running. Call app.examples.stop() first.');
      return;
    }
    this._standalone.load(moves);
    if (autoStart) {
      this._standalone.start();
    } else {
      console.log('📦 G-code moves loaded into memory. Type `app.examples.print()` to start.');
    }
  }
}
