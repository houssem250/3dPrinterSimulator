/**
 * @file lighting.js
 * @description Adds the full lighting rig to a Three.js scene.
 *
 * The rig consists of:
 *  - AmbientLight       — soft fill to prevent pitch-black shadows
 *  - DirectionalLight   — primary shadow-casting key light (sun-like)
 *  - PointLight × 3     — fill, key, and back lights for depth and warmth
 *  - SpotLight          — tight bed light that highlights the print surface
 *
 * All intensity values and positions are sourced from this file only;
 * tweak here and every scene using this rig updates automatically.
 *
 * @module scene/lighting
 */

import * as THREE from 'three';

// ── Constants ─────────────────────────────────────────────────────────────────
// Kept local — these are aesthetic tuning knobs, not printer-physics constants,
// so they live beside the code that uses them rather than in printer_config.js.

const AMBIENT = {
  COLOR:     0xffffff,
  INTENSITY: 1.5,
};

const DIR_LIGHT = {
  COLOR:     0xffffff,
  INTENSITY: 1.5,
  POSITION:  { x: 5, y: 15, z: 7 },
};

const FILL_LIGHT = {
  COLOR:     0xccddff,
  INTENSITY: 1.2,
  POSITION:  { x: -8, y: 8, z: 15 },
};

const KEY_LIGHT = {
  COLOR:     0xffffff,
  INTENSITY: 1.0,
  POSITION:  { x: 8, y: 12, z: 8 },
};

const BACK_LIGHT = {
  COLOR:     0xfffacd,
  INTENSITY: 0.8,
  POSITION:  { x: 0, y: 8, z: -15 },
};

const BED_SPOT = {
  COLOR:     0xffffff,
  INTENSITY: 5.0,
  POSITION:  { x: 0, y: 2, z: 8 },
  TARGET:    { x: 0, y: 4, z: 0 },
  ANGLE:     Math.PI / 5,
  PENUMBRA:  0.3,
  DECAY:     1.5,
  DISTANCE:  30,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Adds the complete lighting rig to `scene` and returns all light objects
 * so callers can adjust or remove individual lights if needed.
 *
 * @param {THREE.Scene} scene  Target scene.
 * @returns {LightingRig}
 *
 * @example
 * import { addLighting } from './scene/lighting.js';
 *
 * const lights = addLighting(scene);
 * lights.bedSpot.intensity = 3; // dim the bed spot at runtime
 */
export function addLighting(scene) {
  const ambient    = _makeAmbient();
  const dirLight   = _makeDirectionalLight();
  const fillLight  = _makeFillLight();
  const keyLight   = _makeKeyLight();
  const backLight  = _makeBackLight();
  const { spot: bedSpot, target: bedTarget } = _makeBedSpot();

  scene.add(ambient, dirLight, fillLight, keyLight, backLight, bedSpot, bedTarget);

  return { ambient, dirLight, fillLight, keyLight, backLight, bedSpot };
}

// ── Private builders ──────────────────────────────────────────────────────────

function _makeAmbient() {
  return new THREE.AmbientLight(AMBIENT.COLOR, AMBIENT.INTENSITY);
}

function _makeDirectionalLight() {
  const light = new THREE.DirectionalLight(DIR_LIGHT.COLOR, DIR_LIGHT.INTENSITY);
  const { x, y, z } = DIR_LIGHT.POSITION;

  light.position.set(x, y, z);
  light.castShadow     = true;
  light.receiveShadow  = true;

  const { SHADOW_MAP_SIZE } = /** @type {import('../config/printer_config.js').PrinterConfig['SCENE']['RENDERER']} */ (
    { SHADOW_MAP_SIZE: 2048 }
  );
  light.shadow.mapSize.width  = SHADOW_MAP_SIZE;
  light.shadow.mapSize.height = SHADOW_MAP_SIZE;

  return light;
}

function _makeFillLight() {
  const { COLOR, INTENSITY, POSITION: { x, y, z } } = FILL_LIGHT;
  const light = new THREE.PointLight(COLOR, INTENSITY);
  light.position.set(x, y, z);
  return light;
}

function _makeKeyLight() {
  const { COLOR, INTENSITY, POSITION: { x, y, z } } = KEY_LIGHT;
  const light = new THREE.PointLight(COLOR, INTENSITY);
  light.position.set(x, y, z);
  return light;
}

function _makeBackLight() {
  const { COLOR, INTENSITY, POSITION: { x, y, z } } = BACK_LIGHT;
  const light = new THREE.PointLight(COLOR, INTENSITY);
  light.position.set(x, y, z);
  return light;
}

/**
 * The bed spot needs its `.target` added to the scene separately,
 * so we return both objects as a pair.
 *
 * @returns {{ spot: THREE.SpotLight, target: THREE.Object3D }}
 */
function _makeBedSpot() {
  const { COLOR, INTENSITY, POSITION, TARGET, ANGLE, PENUMBRA, DECAY, DISTANCE } = BED_SPOT;

  const spot = new THREE.SpotLight(COLOR, INTENSITY);
  spot.position.set(POSITION.x, POSITION.y, POSITION.z);
  spot.target.position.set(TARGET.x, TARGET.y, TARGET.z);
  spot.angle      = ANGLE;
  spot.penumbra   = PENUMBRA;
  spot.decay      = DECAY;
  spot.distance   = DISTANCE;
  spot.castShadow = false; // avoid extra shadow-map cost for the bed fill

  return { spot, target: spot.target };
}

// ── JSDoc types ───────────────────────────────────────────────────────────────

/**
 * @typedef {object} LightingRig
 * @property {THREE.AmbientLight}     ambient
 * @property {THREE.DirectionalLight} dirLight
 * @property {THREE.PointLight}       fillLight
 * @property {THREE.PointLight}       keyLight
 * @property {THREE.PointLight}       backLight
 * @property {THREE.SpotLight}        bedSpot
 */
