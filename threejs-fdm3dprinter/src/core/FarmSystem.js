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

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

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

      // 4. Register Event Listeners
      this.renderer.domElement.addEventListener('click', (e) => this._onMouseClick(e));
      this.renderer.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));

      // Bridge to Zustand for Placement, Fleet, and Selection
      this._setupPlacementSync();
      this._setupFleetSync();
      this._setupSelectionSync();
      this._setupPrintCommandSync();
      this._setupTelemetryPush();
    } catch (err) {
      console.error('❌ FarmSystem failed to load:', err);
    }
  }

  _registerTelemetry(printer) {
    printer.state.onUpdate((telemetry) => {
      // Map telemetry to UI-friendly store fields
      const updates = { ...telemetry };
      
      if (telemetry.layer !== undefined) {
        updates.layers = `${telemetry.layer} / ---`;
      }
      if (telemetry.temp?.nozzle !== undefined) {
        updates.htemp = `${Math.round(telemetry.temp.nozzle)} °C`;
      }
      if (telemetry.temp?.bed !== undefined) {
        updates.btemp = `${Math.round(telemetry.temp.bed)} °C`;
      }

      // Update individual printer state in the store
      useFleetStore.getState().updatePrinter(printer.id, updates);
    });
  }

  _setupTelemetryPush() {
    this.farm.printers.forEach(printer => this._registerTelemetry(printer));
  }

  _setupPrintCommandSync() {
    // Watch for print commands in Zustand
    useFleetStore.subscribe(
      (state) => [state.printAction, state.lastPrintCommand, state.activePrinterId],
      ([action, _ts, activeId]) => {
        if (!action) return;
        
        const printer = this.farm.printers.find(p => p.id === activeId);
        if (!printer) {
          console.warn(`[Farm] Command ${action} ignored: No active printer.`);
          return;
        }

        console.log(`[Farm] 🕹 Executing ${action} on printer ${activeId}`);
        
        if (action === 'start') printer.standalone.start();
        else if (action === 'pause') printer.standalone.pause();
        else if (action === 'resume') printer.standalone.resume();
        else if (action === 'abort') printer.standalone.stop();
      },
      { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] }
    );
  }

  _setupSelectionSync() {
    // Watch for selection changes AND focus requests in Zustand
    useFleetStore.subscribe(
      (state) => [state.activePrinterId, state.lastFocusRequest],
      ([id]) => {
        // We always call select(id) to ensure the camera "snaps back" 
        // even if the user manually moved it away.
        this.farm.select(id);
      },
      { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] } // Custom equality for array
    );
  }

  _setupFleetSync() {
    // Watch for deletions in the fleet groups
    useFleetStore.subscribe(
      (state) => state.fleetGroups,
      (groups) => {
        const allAssetIds = new Set(groups.flatMap(g => g.assets.map(a => a.id)));
        
        // Remove printers that are no longer in the store
        // We skip the 'ghost' or 'unassigned' logic if necessary, 
        // but here we just ensure 3D matches Store.
        this.farm.printers.forEach(p => {
          if (!allAssetIds.has(p.id)) {
            this.farm.removePrinter(p.id);
          }
        });
      }
    );

    // Watch for additions (from Placement Mode)
    this.farm.onSelect((printer, isNew) => {
      if (isNew && printer) {
        this._registerTelemetry(printer);
      }
    });
  }

  _setupPlacementSync() {
    // Watch for placement mode changes in Zustand
    useFleetStore.subscribe(
      (state) => state.placementMode,
      (placement) => {
        if (placement.active) {
          this.farm.enterPlacementMode({ name: placement.pendingAsset?.name });
        } else {
          this.farm.exitPlacementMode();
        }
      }
    );
  }

  _onMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.farm.handleInteraction(this.raycaster); // For hover highlights
  }

  _onMouseClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const hitPosition = this.farm.handleInteraction(this.raycaster);
    const state = useFleetStore.getState();

    if (hitPosition && state.placementMode.active) {
      this._confirmPlacement(hitPosition);
    }
  }

  _confirmPlacement(position) {
    const state = useFleetStore.getState();
    const pending = state.placementMode.pendingAsset;

    // 1. Add to 3D Scene
    const printer = this.farm.addPrinter(position, { 
      name: pending.name,
      model: pending.model 
    });

    // 2. Add to Zustand Store
    state.addAsset(state.targetWizardGroupId, {
      name: pending.name,
      model: pending.model,
      id: printer.id // Sync IDs
    });

    // 3. Exit Mode
    state.setPlacementMode(false);
    state.addLogEntry(`SYSTEM: ${pending.name} deployed at coordinates [${position.x}, ${position.z}]`, "SYS");
  }

  _startRenderLoop() {
    const animate = () => {
      this._rafHandle = requestAnimationFrame(animate);
      
      if (this.farm) {
        this.farm.update();
        if (this.controls) this.controls.enabled = !this.farm.isTransitioning;
      }
      if (this.controls && this.controls.enabled) this.controls.update();
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
