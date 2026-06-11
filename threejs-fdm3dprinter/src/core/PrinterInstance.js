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
import { TelemetryMocker } from '../services/TelemetryMocker.js';
import { DbTelemetryReplay } from '../services/DbTelemetryReplay.js';

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
    this.mqttService = mqttService;

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

    // 7. Shared publish callback — injects directly into MqttService's internal
    // message handler without roundtripping through Mosquitto. Zero external dependencies.
    const _mockPublish = (topic, data) => {
      const brokerUrl = PRINTER_CONFIG.MQTT.BROKER_URL;
      const payloadStr = typeof data === 'string' ? data : JSON.stringify(data);
      this.mqttService._handleMessage(brokerUrl, topic, payloadStr);
    };

    // Synthetic mocker (generates data in-process)
    this.mocker = new TelemetryMocker(id, _mockPublish);

    // DB replay (plays back real recorded telemetry)
    this.dbReplay = new DbTelemetryReplay(id, _mockPublish);
  }

  /**
   * Switches this specific printer between Standalone and Stream modes.
   * @param {'standalone'|'stream'} mode
   * @param {object} [mqttService] Optional singleton service if we share a client
   */
  async switchMode(mode, options = {}) {
    console.log(`[Printer ${this.id}] 🔄 Switching to ${mode} mode...`);
    
    // Stop any active mock source silently when switching away
    if (this.mocker && this.mocker.intervalId) {
      this.mocker.stopSilent();
    }
    if (this.dbReplay?.isRunning) {
      this.dbReplay.stopSilent();
    }

    this.currentProvider.stop();
    this.filament.clear();

    if (mode === 'standalone' || mode === 'disconnected') {
      const entry = this.mqttService?.instances.get(this.id);
      const oldBrokerUrl = entry?.brokerUrl;
      
      this.currentProvider = this.standalone;

      if (this.mqttService && oldBrokerUrl) {
        this.mqttService.disconnect(oldBrokerUrl);
      }
    } else if (mode === 'mock_replay') {
      // Mock mode is fully self-contained: the TelemetryMocker injects frames
      // directly into _handleMessage(), so no MQTT broker connection is needed.
      this.currentProvider = this.stream;
      // Ensure the instance entry has the correct brokerUrl for routing
      const entry = this.mqttService?.instances.get(this.id);
      if (entry) entry.brokerUrl = PRINTER_CONFIG.MQTT.BROKER_URL;
      // Start the sensor flush loop (IMU / flow aggregation) without a broker
      this.mqttService?.startSensorFlusher();
    } else {
      this.currentProvider = this.stream;
      if (this.mqttService && PRINTER_CONFIG.MQTT.ENABLED) {
        const brokerUrl = options.url || PRINTER_CONFIG.MQTT.BROKER_URL;
        const entry = this.mqttService.instances.get(this.id);
        if (entry) entry.brokerUrl = brokerUrl;
        await this.mqttService.connect(brokerUrl);
      }
    }

    this.state.providerMode = mode;
    this.state.reset();

    if (mode !== 'disconnected') {
      await this.currentProvider.start();
    }
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

  /**
   * Cleans up the printer instance to prevent memory/CPU leaks.
   */
  dispose() {
    console.log(`[Printer ${this.id}] 🧹 Disposing resources...`);
    
    // 1. Halt any active mock source
    if (this.mocker) {
      this.mocker.stopSilent();
    }
    if (this.dbReplay) {
      this.dbReplay.stopSilent();
    }

    // 2. Stop providers
    if (this.standalone) {
      this.standalone.stop();
    }
    if (this.stream) {
      this.stream.stop();
    }

    // 3. Dispose filament renderer
    if (this.filament) {
      this.filament.dispose();
    }

    // 4. Dispose cloned materials and geometries for this instance model
    this.model.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}
