/** @type {SceneConfig} */
export const SCENE_CONFIG = Object.freeze({
// ── Scene ──────────────────────────────────────────────────────────────────

  SCENE: Object.freeze({
    BACKGROUND_COLOR: 0xf0f0f0,

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
      SIZE:       100,
      DIVISIONS:  100,
      COLOR_MAIN: 0x999999,
      COLOR_SUB:  0xcccccc,
    }),

    FLOOR: Object.freeze({
      COLOR:    0xffffff,
      ROUGHNESS: 1.0,
      METALNESS: 0.0,
      OPACITY:   0.6,
    }),
  }),

  // ── Animation ──────────────────────────────────────────────────────────────

  ANIMATION: Object.freeze({
    /** Time between timeline keyframes in ms (used by the stress-test helper). */
    TIMELINE_STEP_MS: 2000,
  }),

});
