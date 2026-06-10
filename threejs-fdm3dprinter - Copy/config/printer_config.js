/**
 * @file printer_config.js
 * @description Complete printer configuration for the digital shadow.
 *
 * Structure
 * ─────────
 *  SEMANTIC SECTION  — rich, documented parameters used for state, telemetry,
 *                      temperature simulation, and the gcode_cmd mapping.
 *  RUNTIME SECTION   — flat constants consumed directly by motion/rendering
 *                      classes (AXES, PRINTING, MODEL, ANIMATION).
 *
 * The runtime section is derived from the semantic section so there is only
 * one source of truth. Changing a value in the semantic block automatically
 * propagates everywhere.
 *
 * @module config/printer_config
 */

// ---------------------------------------------------------------------------
// SEMANTIC BLOCK  (human-readable, fully documented)
// ---------------------------------------------------------------------------

export const PRINTER_CONFIG = Object.freeze({

  // =========================================================================
  // METADATA
  // =========================================================================
  metadata: Object.freeze({
    name:           'Creality_Ender3_DigitalShadow',
    type:           'FDM',
    version:        '2.0.0',
    firmwareFlavor: 'Marlin',
  }),

  // =========================================================================
  // HARDWARE — physical, unchangeable properties
  // =========================================================================
  hardware: Object.freeze({
    buildVolume: Object.freeze({
      x: { min: 0, max: 350 },
      y: { min: 0, max: 350 },
      z: { min: 0, max: 250 },
    }),
    origin: 'front-left',
    nozzle: Object.freeze({
      diameter: 0.4,
      count:    1,
    }),
    extruder: Object.freeze({
      count:           1,
      filamentDiameter: 1.75,
      stepsPerMm:      93,
    }),
    bed: Object.freeze({
      heated: true,
      width:  350,
      depth:  350,
    }),
  }),

  // =========================================================================
  // DEFAULTS — initial values, overridable by G-code at runtime
  // =========================================================================
  defaults: Object.freeze({
    motion: Object.freeze({
      feedrate:          1800,   // mm/min  (30 mm/s)
      travelFeedrate:    7200,   // mm/min  (120 mm/s)
      acceleration:      500,    // mm/s²
      travelAcceleration:1000,   // mm/s²
      jerk: Object.freeze({ x: 8, y: 8, z: 0.4, e: 5 }),
      speedMultiplier:   100,    // %
    }),
    extrusion: Object.freeze({
      multiplier:        1.0,
      width:             0.45,   // mm
      maxVolumetricFlow: 12,     // mm³/s
    }),
    temperature: Object.freeze({
      nozzle: 200,
      bed:    60,
    }),
    cooling: Object.freeze({
      fanSpeed:     100,
      minLayerTime: 5,
    }),
    layer: Object.freeze({
      height:           0.2,
      firstLayerHeight: 0.3,
    }),
    material: Object.freeze({
      type:    'PLA',
      density: 1.24,
      temperature: Object.freeze({
        nozzle: { min: 190, optimal: 200, max: 220 },
        bed:    { min:  50, optimal:  60, max:  70 },
      }),
    }),
  }),

  // =========================================================================
  // LIMITS — safety boundaries enforced by the simulation
  // =========================================================================
  limits: Object.freeze({
    speed: Object.freeze({
      x: { min: 0, max: 500 },
      y: { min: 0, max: 500 },
      z: { min: 0, max:  10 },
      e: { min: 0, max:  30 },
    }),
    acceleration: Object.freeze({ min: 100, max: 2000 }),
    temperature:  Object.freeze({
      nozzle: { min: 0, max: 280 },
      bed:    { min: 0, max: 120 },
    }),
    extrusion: Object.freeze({
      multiplier:     { min: 0.5, max: 1.5 },
      volumetricFlow: { max: 15 },
    }),
    softwareEndstops: Object.freeze({
      x: { min: 0, max: 350 },
      y: { min: 0, max: 350 },
      z: { min: 0, max: 250 },
    }),
  }),

  // =========================================================================
  // STATE TEMPLATE — mutable snapshot, deep-copied for each print session
  // =========================================================================
  stateTemplate: {
    position: {
      absolute: { x: 0, y: 0, z: 0, e: 0 },
      relative: { x: 0, y: 0, z: 0, e: 0 },
    },
    modes: {
      positioning: 'absolute',
      extrusion:   'absolute',
      units:       'millimeters',
    },
    motion: {
      feedrate:        1800,
      acceleration:    500,
      jerk:            { x: 8, y: 8, z: 0.4, e: 5 },
      speedMultiplier: 100,
    },
    extrusion: {
      multiplier:     1.0,
      volumetricFlow: 0,
    },
    temperature: {
      nozzle: { target: 0, current: 0 },
      bed:    { target: 0, current: 0 },
    },
    cooling: { fanSpeed: 0 },
    endstops: {
      x: { min: false, max: false },
      y: { min: false, max: false },
      z: { min: false, max: false },
    },
    status: {
      isHomed:      false,
      isPrinting:   false,
      isPaused:     false,
      isHeating:    false,
      hasError:     false,
      errorMessage: '',
    },
  },

  // =========================================================================
  // TELEMETRY
  // =========================================================================
  telemetry: Object.freeze({
    updateRate: 1000,
    enabled:    true,
    parameters: [
      'position_xyz',
      'nozzle_temp',
      'bed_temp',
      'print_progress',
      'extrusion_rate',
      'fan_speed',
      'feedrate',
      'speed_multiplier',
      'flow_multiplier',
    ],
  }),

  // =========================================================================
  // SENSORS
  // =========================================================================
  sensors: Object.freeze({
    temperature:  { hotend: true, bed: true, chamber: false },
    filament:     { runoutSensor: false, flowSensor: false },
    maintenance:  { vibration: false, stepperCurrent: false, powerConsumption: false },
  }),

  // =========================================================================
  // AXES — flat runtime constants consumed by XAxisMotion / YAxisMotion / ZAxisMotion
  // =========================================================================
  AXES: Object.freeze({
    X: Object.freeze({
      MAX_TRAVEL_MM:  350,
      SCREW_PITCH_MM: 8,
    }),
    Y: Object.freeze({
      MAX_TRAVEL_MM:  350,
      SCREW_PITCH_MM: 8,
    }),
    Z: Object.freeze({
      MAX_TRAVEL_MM:  250,
      SCREW_PITCH_MM: 8,
    }),
  }),

  // =========================================================================
  // PRINTING — flat runtime constants consumed by PrintingMotion,
  //            FilamentRenderer, PathGenerators, and BaseAxis
  // =========================================================================
  PRINTING: Object.freeze({
    /** Default feedrate passed to PrintingMotion when none is in the G-code (mm/min). */
    DEFAULT_FEEDRATE_MM_MIN:  1800,
    /** Default print speed for PathGenerators (mm/s). */
    DEFAULT_SPEED_MM_S:       30,
    /** Default layer height for PathGenerators (mm). */
    DEFAULT_LAYER_HEIGHT_MM:  0.2,
    /**
     * Speed multiplier applied to all move durations.
     * 1 = real-time, 10 = 10× faster, 60 = preview mode.
     */
    DEFAULT_SPEED_MULTIPLIER: 60,
    /** G-code bed placement: 'corner' (front-left origin) or 'center'. */
    DEFAULT_PLACEMENT:        'corner',
    /** Minimum move animation time in ms — prevents zero-length frames. */
    MIN_MOVE_DURATION_MS:     8,
    /** Duration of a G28 home animation (ms). */
    HOME_DURATION_MS:         500,
    /** Extra settle time after homing before next move (ms). */
    HOME_SETTLE_MS:           100,
    /** Default filament line color (hex). */
    FILAMENT_COLOR:           0xff6600,
  }),

  // =========================================================================
  // MODEL — GLB asset paths and display scale
  // =========================================================================
  MODEL: Object.freeze({
    /** Path to the printer GLB file, relative to the Vite public root. */
    PATH:  '/models/3dprinter.glb',
    /**
     * Uniform scale applied to the loaded GLB.
     * The Blender model is authored in metres; ×10 converts to scene units
     * where 1 unit ≈ 10 cm, keeping mm G-code values readable.
     */
    SCALE: 10,
  }),

  // =========================================================================
  // MQTT — broker connection and topic definitions
  // =========================================================================
  MQTT: Object.freeze({
    ENABLED: true,
    BROKER_URL: 'ws://localhost:9001', // MQTT over WebSockets
    TOPICS: Object.freeze({
      MOTION: 'octoPrint/motion',
      TEMPERATURE: 'octoPrint/temperature/#',
      PROGRESS: 'octoPrint/progress/printing',
      EVENTS: 'octoPrint/event/#'
    }),
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a deep-copy of the printer state template.
 * Use this to initialise a fresh mutable state object for each print session.
 *
 * @returns {typeof PRINTER_CONFIG.stateTemplate}
 */
export function getCurrentState() {
  return JSON.parse(JSON.stringify(PRINTER_CONFIG.stateTemplate));
}
