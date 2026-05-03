import * as THREE from 'three';
import { bootstrapScene, applyLoadedCameraPosition } from '../../scene/scene_setup.js';
import { addLighting } from '../../scene/lighting.js';
import { addEnvironment } from '../../scene/environment.js';
import { ModelLoader } from '../../model/model_loader.js';
import { PRINTER_CONFIG } from '../../config/printer_config.js';
import { PrinterFarmManager } from './PrinterFarmManager.js';
import { mqttService } from '../services/MqttService.js';
import { AppContext } from '../../app_context.js';
import { useFleetStore } from '../store/useFleetStore.js';

/**
 * FarmSystem
 * 
 * Manages the lifecycle of the Three.js printer farm simulation.
 * It is designed to be hosted within a React component (SceneView.jsx) 
 * but maintains all vanilla Three.js logic for performance.
 */
export class FarmSystem {
  constructor(container) {
    this.container = container;
    this.isInitialized = false;
    this._rafHandle = null;

    // 1. Bootstrap Room
    const { scene, camera, renderer, controls } = bootstrapScene(container);
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;

    Object.assign(AppContext, {
      scene, camera, renderer, controls,
      config: PRINTER_CONFIG
    });

    addLighting(scene);
    addEnvironment(scene);

    this.modelLoader = new ModelLoader(scene);
    AppContext.modelLoader = this.modelLoader;

    this.farm = new PrinterFarmManager(scene, camera, controls);
    AppContext.farm = this.farm;
  }

  async init() {
    if (this.isInitialized) return;

    const removedParts = new Set([
      'Zuführung', 'Kabel-Gondel-main', 'Cable_ribbon',
      'Plug-220v', '220v_cable', 'IEC_connector',
    ]);

    try {
      const printerModel = await this.modelLoader.loadModel(PRINTER_CONFIG.MODEL.PATH, removedParts);
      
      const scale = PRINTER_CONFIG.MODEL.SCALE;
      printerModel.scale.set(scale, scale, scale);
      applyLoadedCameraPosition(this.camera);

      // Startup Grid
      this.farm.setupGrid(1, 1, 8, printerModel, mqttService);

      // Hook farm selection to Zustand
      this.farm.onSelect((id) => {
        useFleetStore.getState().setActivePrinter(id);
      });

      this.isInitialized = true;
      useFleetStore.getState().setFleetInitialized(true);

      // Initialize Dev Tools
      const { PrintingExamples } = await import('../../dev/printing_examples.js');
      AppContext.examples = new PrintingExamples();
      window.app = AppContext;

      this._startRenderLoop();
      console.log('🏗️  Vanilla FarmSystem initialized successfully.');
    } catch (err) {
      console.error('❌ FarmSystem failed to load:', err);
    }
  }

  _startRenderLoop() {
    const animate = () => {
      this._rafHandle = requestAnimationFrame(animate);
      
      if (this.farm) this.farm.update();
      if (this.controls) this.controls.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    animate();
  }

  resize(width, height) {
    if (!this.renderer) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.isInitialized = false;
    if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}
