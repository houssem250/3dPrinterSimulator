/**
 * @file app_context.js
 * @description Application-wide context object — the single replacement for
 * all `window.*` global assignments that were scattered across main.js.
 *
 * Why this pattern instead of raw window globals?
 * ────────────────────────────────────────────────
 *  - Named exports make dependencies explicit; `window.*` is invisible.
 *  - The context object is the only thing exposed to `window`, so the
 *    browser console still works: `app.printer.executePath()`.
 *  - Type annotations mean editors can autocomplete the live objects.
 *  - Circular-dependency risk is eliminated — modules import from config,
 *    never from each other through the global.
 *
 * Usage
 * ─────
 *  // main.js — populate once during boot
 *  import { AppContext } from './app_context.js';
 *  AppContext.scene    = scene;
 *  AppContext.printer  = printer;
 *  window.app = AppContext;   // <— single window assignment
 *
 *  // Any other module — read, never write
 *  import { AppContext } from '../app_context.js';
 *  const pos = AppContext.xAxis.getPosition();
 *
 * @module app_context
 */

/**
 * @typedef {object} IAppContext
 *
 * Three.js primitives
 * @property {import('three').Scene                  | null} scene
 * @property {import('three').PerspectiveCamera      | null} camera
 * @property {import('three').WebGLRenderer          | null} renderer
 * @property {import('three/addons/controls/OrbitControls.js').OrbitControls | null} controls
 *
 * Model
 * @property {import('./model/model_loader.js').ModelLoader | null} modelLoader
 *
 * Axes
 * @property {import('./printer_manager/motion/x_axis.js').XAxisMotion | null} xAxis
 * @property {import('./printer_manager/motion/y_axis.js').YAxisMotion | null} yAxis
 * @property {import('./printer_manager/motion/z_axis.js').ZAxisMotion | null} zAxis
 *
 * Printing
 * @property {import('./printer_manager/motion/printing_motion.js').PrintingMotion | null} printer
 *
 * Dev tools (only populated when running in dev mode)
 * @property {import('./dev/printing_examples.js').PrintingExamples | null} examples
 */

/** @type {IAppContext} */
export const AppContext = {
  // Three.js core
  scene:       null,
  camera:      null,
  renderer:    null,
  controls:    null,

  // Model
  modelLoader: null,

  // Axes
  xAxis:       null,
  yAxis:       null,
  zAxis:       null,

  // Printing
  printer:     null,

  // Dev
  examples:    null,
};
