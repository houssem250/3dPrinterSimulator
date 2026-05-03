import { XAxisMotion } from '../../printer_manager/motion/x_axis.js';
import { YAxisMotion } from '../../printer_manager/motion/y_axis.js';
import { ZAxisMotion } from '../../printer_manager/motion/z_axis.js';
import { FilamentRenderer } from '../../visualization/filament_renderer.js';
import { PrinterState } from './PrinterState.js';
import { FrameNormalizer } from './FrameNormalizer.js';
import { StandaloneProvider } from '../providers/StandaloneProvider.js';
import { StreamProvider } from '../providers/StreamProvider.js';
import { SimulationEngine } from '../engine/SimulationEngine.js';
import { PRINTER_CONFIG } from '../../config/printer_config.js';

/**
 * @file PrinterInstance.js
 * @description Encapsulates a single printer machine in the scene.
 * Holds its own motion logic, providers, and renderer.
 */
export class PrinterInstance {
  /**
   * @param {number} id Unique identifier for the printer
   * @param {THREE.Group} model The cloned 3D model for this printer
   * @param {THREE.Vector3} worldOffset Offset for placement in the scene
   * @param {THREE.Scene} scene Reference to the main scene
   * @param {object} mqttService The shared MqttService singleton
   */
  constructor(id, model, worldOffset, scene, mqttService) {
    this.id = id;
    this.model = model;
    this.worldOffset = worldOffset;
    this.scene = scene;

    // Apply offset
    this.model.position.copy(worldOffset);

    // 0. Unique-ify materials so instances can be highlighted independently
    this.model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
      }
    });

    // 1. Initialise Core State & Logic
    this.state = new PrinterState(id);
    this.normalizer = new FrameNormalizer(PRINTER_CONFIG);
    
    // 2. Initialise Motion Axes
    this.xAxis = new XAxisMotion(null, this.model, PRINTER_CONFIG.MODEL.SCALE);
    this.yAxis = new YAxisMotion(null, this.model, PRINTER_CONFIG.MODEL.SCALE);
    this.zAxis = new ZAxisMotion(null, this.model, PRINTER_CONFIG.MODEL.SCALE);

    // 3. Initialise Filament Renderer
    this.filament = new FilamentRenderer(this.model, scene, {
      color: PRINTER_CONFIG.PRINTING.FILAMENT_COLOR,
      width: PRINTER_CONFIG.defaults.extrusion.width,
      height: PRINTER_CONFIG.defaults.layer.height,
      worldOffset: worldOffset
    });

    // 4. Initialise Providers
    this.standalone = new StandaloneProvider(this.normalizer);
    this.stream = new StreamProvider(this.normalizer);
    this.stream.setDataSource(this.standalone);
    this.currentProvider = this.standalone;

    // 5. Initialise Engine
    this.engine = new SimulationEngine({ x: this.xAxis, y: this.yAxis, z: this.zAxis }, this.filament);
    this.engine.connect(this.state);

    // Wire providers to state updates
    this.standalone.onFrame((f) => this.state.update(f));
    this.stream.onFrame((f) => this.state.update(f));

    // 6. Register for MQTT Telemetry
    // Prefix convention: 0 -> octoPrint/ (To match Custom Python Plugin), Others -> printerN/
    const prefix = (id === 0) ? "octoPrint/" : `printer${id}/`;
    mqttService.registerPrinter(id, this.stream, prefix);
    console.log(`[Printer ${id}] 📡 Registered for MQTT prefix: ${prefix}`);
  }

  /**
   * Switches this specific printer between Standalone and Stream modes.
   * @param {'standalone'|'stream'} mode
   * @param {object} [mqttService] Optional singleton service if we share a client
   */
  async switchMode(mode, mqttService = null) {
    console.log(`[Printer ${this.id}] 🔄 Switching to ${mode} mode...`);
    this.currentProvider.stop();
    this.filament.clear();

    if (mode === 'standalone') {
      this.currentProvider = this.standalone;
    } else {
      this.currentProvider = this.stream;
      if (mqttService && PRINTER_CONFIG.MQTT.ENABLED) {
        await mqttService.connect();
      }
    }

    this.state.providerMode = mode;
    this.state.reset(); // Clear old state and push new mode to UI

    await this.currentProvider.start();
  }

  /**
   * Helper to find a part WITHIN this specific printer group.
   * @param {string} name 
   * @returns {THREE.Object3D|null}
   */
  findPart(name) {
    let found = null;
    this.model.traverse(child => {
      if (!found && child.name === name) found = child;
    });
    return found;
  }
}
