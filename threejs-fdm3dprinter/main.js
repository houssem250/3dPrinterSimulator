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

import * as THREE from 'three';
import './style.css';
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

  // ── 4a. Apply metadata & Scale ──────────────────────────────────────────
  const scale = PRINTER_CONFIG.MODEL.SCALE;
  printerModel.scale.set(scale, scale, scale);

  applyLoadedCameraPosition(camera);
  modelLoader.logBedDimensions?.();

  // ── 4. Initialise Printer Farm ──────────────────────────────────────────
  const { PrinterFarmManager } = await import('./src/core/PrinterFarmManager.js');
  const { mqttService } = await import('./src/services/MqttService.js');
  
  const farm = new PrinterFarmManager(scene, camera, controls);
  AppContext.farm = farm;

  // Farm Config
  const ROWS = 2;
  const COLS = 2;
  const SPACING = 8; // units

  farm.setupGrid(ROWS, COLS, SPACING, printerModel, mqttService);

  // ── 5. Add Printer & Deployment Menu ─────────────────────────────────────
  const { AddPrinterMenu } = await import('./src/ui/AddPrinterMenu.js');
  const addMenu = new AddPrinterMenu((variant) => {
    farm.enterPlacementMode(variant);
  });

  // ── 6. Navigation HUD (Mini-Map) ─────────────────────────────────────────
  const { NavigationHUD } = await import('./src/ui/NavigationHUD.js');
  const hud = new NavigationHUD(
    AppContext.printers.length, 
    COLS, 
    (id) => farm.select(id),
    (id, active) => farm.highlight(id, active),
    () => addMenu.show(),
    () => farm.focusOverview()
  );

  // Sync HUD highlight & refresh when farm changes
  farm.onSelect((id, wasAdded) => {
    if (wasAdded) {
      hud.refresh(AppContext.printers.length);
    }
    hud.updateSelection(id);
  });

  // ── 7. Interaction (Placement Mode) ──────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  window.addEventListener('mousemove', (event) => {
    if (!farm.isPlacementMode) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    farm.handleInteraction(raycaster);
  });

  window.addEventListener('click', () => {
    if (!farm.isPlacementMode) return;
    const spawnPos = farm.handleInteraction(raycaster);
    if (spawnPos) {
      const p = farm.addPrinter(spawnPos, farm.pendingVariant);
      farm.exitPlacementMode();
      farm.focusOn(p.id);
    }
  });

  document.getElementById('cancel-placement').onclick = () => farm.exitPlacementMode();

  // ── 8. Dev tools ─────────────────────────────────────────────────────────
  if (IS_DEV) {
    const { PrintingExamples } = await import('./dev/printing_examples.js');
    AppContext.examples = new PrintingExamples();

    window.app = AppContext;

    console.log('🏗️  Print Farm Manager Ready');
    console.log('   app.farm.focusOn(id)  — smooth glide to machine');
    console.log('   app.farm.select(null) — reset focus');
  }

  console.log(`✅ Print Farm initialized with ${AppContext.printers.length} printers.`);

}).catch((err) => {
  console.error('❌ Failed to load printer model:', err);
});


// ── 7. Render loop ────────────────────────────────────────────────────────────

(function animate() {
  requestAnimationFrame(animate);

  // Smoothly glide camera if focus is active
  if (AppContext.farm) {
    AppContext.farm.update();
  }

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
