/**
 * @file main.js
 * @description Application entry point.
 *
 * Boot sequence
 * ─────────────
 *  1. Bootstrap the Three.js scene (camera, renderer, controls) from SCENE_CONFIG.
 *  2. Add lighting and environment dressing.
 *  3. Load the printer GLB model asynchronously (path from PRINTER_CONFIG.MODEL).
 *  4. On load: initialise axes, V3 Providers (Standalone/Stream), and SimulationEngine.
 *  5. In dev mode: attach console helpers and expose `window.app`.
 *  6. Start the render loop.
 */

import { bootstrapScene, applyLoadedCameraPosition } from './scene/scene_setup.js';
import { addLighting } from './scene/lighting.js';
import { addEnvironment } from './scene/environment.js';
import { ModelLoader } from './model/model_loader.js';
import { XAxisMotion } from './printer_manager/motion/x_axis.js';
import { YAxisMotion } from './printer_manager/motion/y_axis.js';
import { ZAxisMotion } from './printer_manager/motion/z_axis.js';
import { FilamentRenderer } from './visualization/filament_renderer.js';
import { PRINTER_CONFIG } from './config/printer_config.js';
import { SCENE_CONFIG } from './config/scene_config.js';
import { AppContext } from './app_context.js';

const IS_DEV = true;

// ── 1. Scene bootstrap ────────────────────────────────────────────────────────

const { scene, camera, renderer, controls } = bootstrapScene();
Object.assign(AppContext, {
  scene, camera, renderer, controls,
  config: PRINTER_CONFIG,
  sceneConfig: SCENE_CONFIG
});

// ── 2. Lighting & environment ─────────────────────────────────────────────────

addLighting(scene);
addEnvironment(scene);

// ── 3. Load model ─────────────────────────────────────────────────────────────

const modelLoader = new ModelLoader(scene);
AppContext.modelLoader = modelLoader;

const removedParts = new Set([
  'Zuführung', 'Kabel-Gondel-main', 'Cable_ribbon',
  'Plug-220v', '220v_cable', 'IEC_connector',
]);

modelLoader.loadModel(PRINTER_CONFIG.MODEL.PATH, removedParts).then(async (printerModel) => {

  // ── 4a. Scale and position model ─────────────────────────────────────────
  const scale = PRINTER_CONFIG.MODEL.SCALE;
  printerModel.position.set(0, 0, 0);
  printerModel.scale.set(scale, scale, scale);

  applyLoadedCameraPosition(camera);
  modelLoader.logBedDimensions?.();

  // ── 4b. Initialise axes ──────────────────────────────────────────────────
  const xAxis = new XAxisMotion(modelLoader, printerModel, scale);
  const yAxis = new YAxisMotion(modelLoader, printerModel, scale);
  const zAxis = new ZAxisMotion(modelLoader, printerModel, scale);

  Object.assign(AppContext, { xAxis, yAxis, zAxis });

  _attachStressTestTimelines(xAxis, yAxis, zAxis);

  // ── 4c. Initialise V3 Architecture ───────────────────────────────────────
  const { PrinterState } = await import('./src/core/PrinterState.js');
  const { FrameNormalizer } = await import('./src/core/FrameNormalizer.js');
  const { StandaloneProvider } = await import('./src/providers/StandaloneProvider.js');
  const { StreamProvider } = await import('./src/providers/StreamProvider.js');
  const { SimulationEngine } = await import('./src/engine/SimulationEngine.js');
  const { mqttService } = await import('./src/services/MqttService.js');

  const state = new PrinterState();
  const normalizer = new FrameNormalizer(PRINTER_CONFIG);
  const standalone = new StandaloneProvider(normalizer);
  const stream = new StreamProvider(normalizer);
  stream.setDataSource(standalone);

  // ── 4d. Initialise FilamentRenderer ───────────────────────────────────────
  const filament = new FilamentRenderer(scene, {
    color: PRINTER_CONFIG.PRINTING.FILAMENT_COLOR,
    width: PRINTER_CONFIG.defaults.extrusion.width,
    height: PRINTER_CONFIG.defaults.layer.height,
  });

  const engine = new SimulationEngine({ x: xAxis, y: yAxis, z: zAxis }, filament);
  engine.connect(state);

  // Wire providers to state updates
  standalone.onFrame((f) => state.update(f));
  stream.onFrame((f) => state.update(f));

  Object.assign(AppContext, {
    state,
    engine,
    standalone,
    stream,
    filament,
    currentProvider: standalone,
  });

  /**
   * Switches between Standalone and Stream modes.
   * @param {'standalone'|'stream'} mode
   */
  AppContext.switchMode = async (mode) => {
    console.log(`🔄 Switching to ${mode} mode...`);
    AppContext.currentProvider.stop();
    AppContext.filament.clear();
    
    if (mode === 'standalone') {
      AppContext.currentProvider = standalone;
    } else {
      AppContext.currentProvider = stream;
      if (PRINTER_CONFIG.MQTT.ENABLED) {
        await mqttService.connect();
      }
    }
    
    await AppContext.currentProvider.start();
  };

  // ── 5. Dev tools ─────────────────────────────────────────────────────────
  if (IS_DEV) {
    import('./dev/printing_examples.js').then(({ PrintingExamples }) => {
      AppContext.examples = new PrintingExamples();
    });

    window.app = AppContext;

    console.log('🛠️  V3 Architecture Ready — use window.app to access all objects');
    console.log('   app.switchMode("stream")');
    console.log('   app.standalone.load(moves); app.standalone.start()');
    console.log('   app.examples.tower()');
    console.log('   app.filament.clear()');
  }

  console.log('✅ Printer simulation ready (V3).');

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
 * Attaches stress-test timelines to each axis.
 * Accessible via `app.xAxis.playTimeline()` etc. in the dev console.
 */
function _attachStressTestTimelines(xAxis, yAxis, zAxis) {
  const step = SCENE_CONFIG.ANIMATION.TIMELINE_STEP_MS;

  const toTimeline = (positions) =>
    positions.map((pos, i) => ({ position: pos, time: i * step }));

  const testPositions = [0, -800, 0, 800, 0];

  xAxis.setTimeline(toTimeline(testPositions));
  yAxis.setTimeline(toTimeline(testPositions));
  zAxis.setTimeline(toTimeline(testPositions));
}
