/**
 * @file simulation_config.js
 * @description Simulation‑only settings (camera, UI, printing behaviour).
 */
import { PRINTER_CONFIG } from './printer_config.js';

export const SIMULATION_CONFIG = Object.freeze({
  PRINTER: Object.freeze({
    
  }),

  MODEL: Object.freeze({
    PATH: 'models/3dprinter.glb',
    SCALE: 10,
    BED: Object.freeze({
        /** Nominal bed dimensions in mm. */
        WIDTH_MM:  PRINTER_CONFIG.MODEL.BED.WIDTH_MM,
        DEPTH_MM:  PRINTER_CONFIG.MODEL.BED.DEPTH_MM,
    }),
    AXES_SCREW_PITCH_MM: 8,
  }),

    // ── Printing behaviour ────────────────────────────────────────────────
  PRINTING: Object.freeze({
    DEFAULT_FEEDRATE_MM_MIN: 1800,      // 30 mm/s
    DEFAULT_SPEED_MM_S: 50,
    DEFAULT_LAYER_HEIGHT_MM: 0.2,
    DEFAULT_SPEED_MULTIPLIER: 1,
    DEFAULT_PLACEMENT: /** @type {'corner' | 'center'} */ ('center'),
    MIN_MOVE_DURATION_MS: 16,
    HOME_DURATION_MS: 800,
    HOME_SETTLE_MS: 100,
    FILAMENT_COLOR: 0xff6600,
  }),

  // ── Scene / Camera ────────────────────────────────────────────────────
  SCENE: Object.freeze({
    BACKGROUND_COLOR: 0x888888,

    CAMERA: Object.freeze({
      FOV: 45,
      NEAR: 0.1,
      FAR: 1000,
      INITIAL_POSITION: { x: 8, y: 6, z: 12 },
      LOADED_POSITION:  { x: 16, y: 16, z: 16 },
      LOOK_AT:          { x: 0, y: 3, z: 0 },
    }),

    CONTROLS: Object.freeze({
      ENABLE_DAMPING: true,
      TARGET: { x: 0, y: 3, z: 0 },
    }),

    RENDERER: Object.freeze({
      ANTIALIAS: true,
      SHADOW_MAP: true,
      SHADOW_MAP_SIZE: 2048,
    }),

    GRID: Object.freeze({
      SIZE: 20,
      DIVISIONS: 20,
      COLOR_MAIN: 0x888888,
      COLOR_SUB: 0x444444,
    }),

    FLOOR: Object.freeze({
      COLOR: 0x223344,
      ROUGHNESS: 0.8,
      METALNESS: 0.1,
      OPACITY: 0.3,
    }),
  }),

  // ── Animation ─────────────────────────────────────────────────────────
  ANIMATION: Object.freeze({
    TIMELINE_STEP_MS: 2000,
  }),
});