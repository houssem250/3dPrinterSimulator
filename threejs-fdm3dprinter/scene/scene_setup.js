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
import { SCENE_CONFIG } from '../config/scene_config.js';


const { CAMERA, CONTROLS, RENDERER } = SCENE_CONFIG.SCENE;

// ── Scene ─────────────────────────────────────────────────────────────────────

/**
 * Creates a bare Three.js Scene with a Fusion 360-style gradient background.
 *
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = _createGradientBackground();
  return scene;
}

/**
 * Generates a vertical gradient texture (White -> Light Gray).
 * @returns {THREE.CanvasTexture}
 */
function _createGradientBackground() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, size);
  
  // Fusion 360 top-down gradient
  gradient.addColorStop(0, '#ffffff'); // Top
  gradient.addColorStop(1, '#d0d0d0'); // Bottom (slightly darker than config for depth)
  
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  const { LOADED_POSITION, LOOK_AT } = CAMERA;
  camera.position.set(LOADED_POSITION.x, LOADED_POSITION.y, LOADED_POSITION.z);
  camera.lookAt(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z);
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
