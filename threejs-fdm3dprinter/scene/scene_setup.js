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
 * Creates a bare Three.js Scene with the configured background color.
 *
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_CONFIG.SCENE.BACKGROUND_COLOR);
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
  const { LOADED_POSITION, LOOK_AT } = CAMERA;
  camera.position.set(LOADED_POSITION.x, LOADED_POSITION.y, LOADED_POSITION.z);
  camera.lookAt(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z);
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Creates a WebGLRenderer **without** mounting it to the DOM.
 *
 * The consumer is responsible for appending `renderer.domElement` to a
 * container — see {@link mountRenderer}.
 *
 * Shadow maps are enabled; the shadow-map size is read from config.
 *
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: RENDERER.ANTIALIAS });

  // Placeholder size — will be corrected by mountRenderer / ResizeObserver.
  renderer.setSize(1, 1);
  renderer.setPixelRatio(window.devicePixelRatio);

  if (RENDERER.SHADOW_MAP) {
    renderer.shadowMap.enabled = true;
  }

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
 * Observes a container element and keeps the renderer + camera in sync
 * with its dimensions.  Uses ResizeObserver so the canvas tracks the
 * container — not the full browser window — which is essential for the
 * desktop shell layout (header / sidebar / canvas / footer).
 *
 * Safe to call multiple times — the previous observer is disconnected first.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.WebGLRenderer}     renderer
 * @param {HTMLElement}             container
 */
export function registerResizeHandler(camera, renderer, container) {
  // Tear down any previous observer (HMR safety).
  if (renderer.__resizeObserver) {
    renderer.__resizeObserver.disconnect();
  }

  const ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);   // false = don't touch CSS
  });

  ro.observe(container);
  renderer.__resizeObserver = ro;
}

// ── Mount renderer into a container ───────────────────────────────────────────

/**
 * Appends the renderer's canvas to `container`, sizes it to fit, and
 * starts a ResizeObserver so future layout changes are tracked.
 *
 * Call this from the React layer once a ref to the container `<div>` is
 * available.
 *
 * @param {THREE.WebGLRenderer}     renderer
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement}             container
 */
export function mountRenderer(renderer, camera, container) {
  // CSS makes the canvas fill whatever container it lives in.
  // setSize(w, h, false) then sets the *drawing-buffer* resolution to match.
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width   = '100%';
  canvas.style.height  = '100%';

  container.appendChild(canvas);

  // Immediately size the buffer to the container's current dimensions.
  const { clientWidth: w, clientHeight: h } = container;
  if (w > 0 && h > 0) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  registerResizeHandler(camera, renderer, container);
}

// ── Convenience bootstrap ─────────────────────────────────────────────────────

/**
 * One-call setup that creates every rendering primitive **without** mounting
 * the canvas to the DOM.  The consumer must call {@link mountRenderer}
 * to place the canvas inside a container element.
 *
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, controls: OrbitControls }}
 *
 * @example
 * const { scene, camera, renderer, controls } = bootstrapScene();
 * // later, inside React:
 * mountRenderer(renderer, camera, containerDiv);
 */
export function bootstrapScene() {
  const scene    = createScene();
  const camera   = createCamera();
  const renderer = createRenderer();
  const controls = createControls(camera, renderer);

  return { scene, camera, renderer, controls };
}
