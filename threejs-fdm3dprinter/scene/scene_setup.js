/**
 * @file scene_setup.js
 * @description Creates and configures the core Three.js rendering pipeline.
 *
 * Responsibilities
 * ────────────────
 *  - Instantiate the WebGLRenderer and mount it to the DOM.
 *  - Create the PerspectiveCamera at its initial position.
 *  - Attach OrbitControls.
 *  - Register a window-resize listener that keeps the aspect ratio correct.
 *
 * This module is intentionally free of lighting and environment setup —
 * see lighting.js and environment.js for those concerns.
 *
 * @module scene/scene_setup
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PRINTER_CONFIG } from '../config/printer_config.js';

const { CAMERA, CONTROLS, RENDERER } = PRINTER_CONFIG.SCENE;

// ── Scene ─────────────────────────────────────────────────────────────────────

/**
 * Creates a bare Three.js Scene with the configured background color.
 *
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PRINTER_CONFIG.SCENE.BACKGROUND_COLOR);
  return scene;
}

// ── Camera ────────────────────────────────────────────────────────────────────

/**
 * Creates a PerspectiveCamera positioned at the pre-model-load default.
 * Call {@link applyLoadedCameraPosition} once the GLB is ready.
 *
 * @returns {THREE.PerspectiveCamera}
 */
export function createCamera() {
  const { FOV, NEAR, FAR, INITIAL_POSITION, LOOK_AT } = CAMERA;

  const camera = new THREE.PerspectiveCamera(
    FOV,
    window.innerWidth / window.innerHeight,
    NEAR,
    FAR,
  );

  camera.position.set(INITIAL_POSITION.x, INITIAL_POSITION.y, INITIAL_POSITION.z);
  camera.lookAt(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z);

  return camera;
}

/**
 * Repositions the camera to the post-load position so the full model is visible.
 * Should be called inside the ModelLoader `onLoad` callback.
 *
 * @param {THREE.PerspectiveCamera} camera
 */
export function applyLoadedCameraPosition(camera) {
  const { LOADED_POSITION } = CAMERA;
  camera.position.set(LOADED_POSITION.x, LOADED_POSITION.y, LOADED_POSITION.z);
  camera.lookAt(LOADED_POSITION.x, LOADED_POSITION.y, LOADED_POSITION.z);
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Creates, sizes, and mounts the WebGLRenderer to `document.body`.
 *
 * Shadow maps are enabled; the shadow-map size is read from config.
 *
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: RENDERER.ANTIALIAS });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  if (RENDERER.SHADOW_MAP) {
    renderer.shadowMap.enabled = true;
  }

  document.body.appendChild(renderer.domElement);
  return renderer;
}

// ── Controls ──────────────────────────────────────────────────────────────────

/**
 * Attaches OrbitControls to the given camera and renderer.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.WebGLRenderer}     renderer
 * @returns {OrbitControls}
 */
export function createControls(camera, renderer) {
  const { TARGET, ENABLE_DAMPING } = CONTROLS;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = ENABLE_DAMPING;
  controls.target.set(TARGET.x, TARGET.y, TARGET.z);

  return controls;
}

// ── Resize handler ────────────────────────────────────────────────────────────

/**
 * Registers a `resize` listener that keeps the camera aspect ratio and
 * renderer size in sync with the browser window.
 *
 * Safe to call multiple times — the previous listener is removed first.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.WebGLRenderer}     renderer
 */
export function registerResizeHandler(camera, renderer) {
  // Remove any previously registered handler attached to this renderer
  // so hot-module-replacement doesn't stack listeners.
  if (renderer.__resizeHandler) {
    window.removeEventListener('resize', renderer.__resizeHandler);
  }

  const handler = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  renderer.__resizeHandler = handler;
  window.addEventListener('resize', handler);
}

// ── Convenience bootstrap ─────────────────────────────────────────────────────

/**
 * One-call setup that creates every rendering primitive, mounts the canvas,
 * and registers the resize handler.
 *
 * Returns everything needed to build the rest of the app.
 *
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, controls: OrbitControls }}
 *
 * @example
 * import { bootstrapScene } from './scene/scene_setup.js';
 *
 * const { scene, camera, renderer, controls } = bootstrapScene();
 */
export function bootstrapScene() {
  const scene    = createScene();
  const camera   = createCamera();
  const renderer = createRenderer();
  const controls = createControls(camera, renderer);

  registerResizeHandler(camera, renderer);

  return { scene, camera, renderer, controls };
}
