/**
 * @file main.js
 * @description Application entry point.
 *
 * This file is intentionally thin — it wires modules together and drives the
 * render loop. No business logic belongs here.
 *
 * Boot sequence
 * ─────────────
 *  1. Bootstrap the Three.js scene (camera, renderer, controls).
 *  2. Add lighting and environment dressing.
 *  3. Load the printer GLB model asynchronously.
 *  4. On load: initialise all three axes, then PrintingMotion.
 *  5. In dev mode: attach console helpers and expose `window.app`.
 *  6. Start the render loop.
 */

import { bootstrapScene, applyLoadedCameraPosition } from './scene/scene_setup.js';
import { addLighting }     from './scene/lighting.js';
import { addEnvironment }  from './scene/environment.js';
import { ModelLoader }     from './model/model_loader.js';
import { XAxisMotion }     from './printer_manager/motion/x_axis.js';
import { YAxisMotion }     from './printer_manager/motion/y_axis.js';
import { ZAxisMotion }     from './printer_manager/motion/z_axis.js';
import { PrintingMotion }  from './printer_manager/motion/printing_motion.js';
import { PRINTER_CONFIG }  from './config/printer_config.js';
import { AppContext }      from './app_context.js';

// Dev-only import — tree-shaken in production builds.
// Replace the conditional below with your bundler's `import.meta.env.DEV` flag.
const IS_DEV = true;

// ── 1. Scene bootstrap ────────────────────────────────────────────────────────

const { scene, camera, renderer, controls } = bootstrapScene();

Object.assign(AppContext, { scene, camera, renderer, controls });

// ── 2. Lighting & environment ─────────────────────────────────────────────────

addLighting(scene);
addEnvironment(scene);

// ── 3. Load model ─────────────────────────────────────────────────────────────

const modelLoader = new ModelLoader(scene);
AppContext.modelLoader = modelLoader;

modelLoader.loadModel(PRINTER_CONFIG.MODEL.PATH).then((printerModel) => {

  // ── 4a. Normalize model size ─────────────────────────────────────────────
  //modelLoader.normalizeModel();

  // ── 4b. Position model ───────────────────────────────────────────────────
  const scale = PRINTER_CONFIG.MODEL.SCALE;
  printerModel.position.set(0, 0, 0);
  printerModel.scale.set(scale, scale, scale);

  applyLoadedCameraPosition(camera);
  modelLoader.logBedDimensions();

  // ── 4c. Initialise axes ──────────────────────────────────────────────────
  const xAxis = new XAxisMotion(modelLoader, printerModel, scale);
  const yAxis = new YAxisMotion(modelLoader, printerModel, scale);
  const zAxis = new ZAxisMotion(modelLoader, printerModel, scale);

  Object.assign(AppContext, { xAxis, yAxis, zAxis });

  _attachStressTestTimelines(xAxis, yAxis, zAxis);

  // ── 4d. Initialise PrintingMotion ────────────────────────────────────────
  const printer = new PrintingMotion(xAxis, yAxis, zAxis, {
    placement:       PRINTER_CONFIG.PRINTING.DEFAULT_PLACEMENT,
    speedMultiplier: PRINTER_CONFIG.PRINTING.DEFAULT_SPEED_MULTIPLIER,
  });
  AppContext.printer = printer;

  // ── 5. Dev tools ─────────────────────────────────────────────────────────
  if (IS_DEV) {
    import('./dev/printing_examples.js').then(({ PrintingExamples }) => {
      AppContext.examples = new PrintingExamples();
    });

    // Single window assignment — everything available under `app.*`
    window.app = AppContext;

    console.log('🛠️  Dev mode — use window.app to access all objects');
    console.log('   app.printer.executePath()');
    console.log('   app.examples.tower()');
    console.log('   app.xAxis.moveToPosition(150, 1000)');
    console.log('   app.printer.getStatus()');
  }

  console.log('✅ Printer simulation ready.');

}).catch((err) => {
  console.error('❌ Failed to load printer model:', err);
});

// ── 6. Render loop ────────────────────────────────────────────────────────────

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Attaches a simple out-of-range stress-test timeline to each axis.
 * The clamping logic in each axis should contain all values to [0, maxTravel].
 *
 * Accessible via `app.xAxis.playTimeline()` etc. in the dev console.
 *
 * @param {XAxisMotion} xAxis
 * @param {YAxisMotion} yAxis
 * @param {ZAxisMotion} zAxis
 */
function _attachStressTestTimelines(xAxis, yAxis, zAxis) {
  const step = PRINTER_CONFIG.ANIMATION.TIMELINE_STEP_MS;

  /** @param {number[]} positions */
  const toTimeline = (positions) =>
    positions.map((pos, i) => ({ position: pos, time: i * step }));

  // Include out-of-range values to verify clamping
  const testPositions = [0, -800, 0, 800, 0];

  xAxis.setTimeline(toTimeline(testPositions));
  yAxis.setTimeline(toTimeline(testPositions));
  zAxis.setTimeline(toTimeline(testPositions));
}
