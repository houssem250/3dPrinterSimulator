/**
 * @file printer_config.js
 * @description Central configuration for the FDM 3D-printer simulation.
 *
 * All magic numbers that were previously scattered across axis files, main.js,
 * and PrintingMotion live here. Import this object wherever a constant is needed
 * — never hard-code a value in a class body.
 *
 * Sections
 * ────────
 *  MODEL      — GLB asset path and scene scale factor
 *  AXES       — per-axis travel limits and lead-screw pitch
 *  BED        — physical bed dimensions in mm
 *  PRINTING   — default feedrate, layer height, speed multiplier
 *  SCENE      — camera, renderer, and lighting defaults
 *  ANIMATION  — timeline step and homing duration
 */

/** @type {PrinterConfig} */
export const PRINTER_CONFIG = Object.freeze({

  // ── Model ──────────────────────────────────────────────────────────────────

  MODEL: Object.freeze({
    /** Path to the GLB asset, relative to the server root. */
    PATH: 'models/3dprinter.glb',

    /**
     * Uniform scale applied to the loaded model.
     * All axis limit calculations must account for this factor.
     */
    SCALE: 10,
    BED: Object.freeze({
      /** Nominal bed dimensions in mm. */
      WIDTH_MM:  300,
      DEPTH_MM:  300,
    }),
  }),

  // ── Axes ───────────────────────────────────────────────────────────────────

  AXES: Object.freeze({
    X: Object.freeze({
      /** Maximum travel in millimetres (clamped by physical roller limits). */
      MAX_TRAVEL_MM: 300,
      /** Lead-screw pitch in mm per full rotation. */
      SCREW_PITCH_MM: 8,
    }),
    Y: Object.freeze({
      MAX_TRAVEL_MM: 300,
      SCREW_PITCH_MM: 8,
    }),
    Z: Object.freeze({
      MAX_TRAVEL_MM: 250,
      SCREW_PITCH_MM: 8,
    }),
  }),

  // ── Bed ────────────────────────────────────────────────────────────────────

  BED: Object.freeze({
    /**
     * Nominal bed dimensions in mm.
     * Used as the G-code coordinate space when PrintingMotion cannot
     * auto-detect them from the loaded model.
     */
    WIDTH_MM:  300,
    DEPTH_MM:  300,
  }),

  // ── Printing ───────────────────────────────────────────────────────────────

  PRINTING: Object.freeze({
    /** Default feedrate in mm/min (equivalent to 30 mm/s). */
    DEFAULT_FEEDRATE_MM_MIN: 1800,

    /** Default movement speed used by path generators, in mm/s. */
    DEFAULT_SPEED_MM_S: 50,

    /** Default layer height in mm. */
    DEFAULT_LAYER_HEIGHT_MM: 0.2,

    /**
     * Speed multiplier applied to all move durations.
     * 1 = real-time, 2 = 2× faster, 10 = 10× faster.
     */
    DEFAULT_SPEED_MULTIPLIER: 1,

    /** Default placement mode for G-code coordinate origin. */
    DEFAULT_PLACEMENT: /** @type {'corner' | 'center'} */ ('center'),

    /** Minimum move duration in ms (prevents zero-duration frames). */
    MIN_MOVE_DURATION_MS: 16,

    /** Duration in ms used for homing moves. */
    HOME_DURATION_MS: 800,

    /** Extra delay in ms added after a home move completes. */
    HOME_SETTLE_MS: 100,

    /** Filament line color (orange). */
    FILAMENT_COLOR: 0xff6600,
  }),

  // ── Scene ──────────────────────────────────────────────────────────────────

  SCENE: Object.freeze({
    BACKGROUND_COLOR: 0x888888,

    CAMERA: Object.freeze({
      FOV:          45,
      NEAR:         0.1,
      FAR:          1000,
      /** Initial position before the model loads. */
      INITIAL_POSITION: Object.freeze({ x: 8,  y: 6,  z: 12 }),
      /** Position applied once the model is ready. */
      LOADED_POSITION:  Object.freeze({ x: 16, y: 16, z: 16 }),
      LOOK_AT:          Object.freeze({ x: 0,  y: 3,  z: 0  }),
    }),

    CONTROLS: Object.freeze({
      ENABLE_DAMPING: true,
      TARGET: Object.freeze({ x: 0, y: 3, z: 0 }),
    }),

    RENDERER: Object.freeze({
      ANTIALIAS:        true,
      SHADOW_MAP:       true,
      SHADOW_MAP_SIZE:  2048,
    }),

    GRID: Object.freeze({
      SIZE:       20,
      DIVISIONS:  20,
      COLOR_MAIN: 0x888888,
      COLOR_SUB:  0x444444,
    }),

    FLOOR: Object.freeze({
      COLOR:    0x223344,
      ROUGHNESS: 0.8,
      METALNESS: 0.1,
      OPACITY:   0.3,
    }),
  }),

  // ── Animation ──────────────────────────────────────────────────────────────

  ANIMATION: Object.freeze({
    /** Time between timeline keyframes in ms (used by the stress-test helper). */
    TIMELINE_STEP_MS: 2000,
  }),

});
