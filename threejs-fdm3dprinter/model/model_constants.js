/**
 * @file model_constants.js
 * @description Static registries for the loaded GLB model.
 *
 * These were `static` class fields on `ModelLoader` in the original code,
 * which caused two problems:
 *  1. Static fields on a class are shared across all instances — one import
 *     could silently pollute another's part list.
 *  2. The color override map was initialised empty with a comment showing
 *     examples, suggesting it was never actually used at runtime.
 *
 * Moving them here as plain module-level exports makes the data explicit,
 * importable anywhere without pulling in the full loader, and easy to extend.
 *
 * @module model/model_constants
 */

/**
 * Registry of every object name discovered during the last GLB load.
 * Populated by `ModelLoader.loadModel()` — do not write to this directly.
 *
 * Exposed as a `Set` so callers can do fast `has()` lookups.
 *
 * @type {Set<string>}
 */
export const PART_NAMES = new Set();

/**
 * Color overrides applied during material setup.
 * Maps a part name → hex color integer.
 *
 * Populate this before calling `loadModel()` if you need to force
 * a specific color on a named part regardless of the GLB material.
 *
 * @type {Map<string, number>}
 *
 * @example
 * import { COLOR_OVERRIDES } from './model/model_constants.js';
 * COLOR_OVERRIDES.set('Frame',  0x333333);
 * COLOR_OVERRIDES.set('Tisch',  0x1a1a2e);
 */
export const COLOR_OVERRIDES = new Map();

/**
 * Material appearance rules applied to every mesh during load.
 * Centralised here so tweaking the look doesn't require touching loader logic.
 */
export const MATERIAL_DEFAULTS = Object.freeze({
  /** White (#ffffff) meshes are replaced with this gray to avoid blown-out highlights. */
  WHITE_REPLACEMENT: 0x888888,

  /**
   * Any mesh whose base color is darker than this threshold gets brightened.
   * Prevents near-black parts from disappearing under the scene lighting.
   */
  DARKNESS_THRESHOLD: 0x333333,

  /** Amount added to a color that falls below DARKNESS_THRESHOLD. */
  BRIGHTNESS_BOOST: 0x444444,

  ROUGHNESS: 0.7,
  METALNESS: 0.2,
});
