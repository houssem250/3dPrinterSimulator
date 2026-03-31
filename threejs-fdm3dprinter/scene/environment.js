/**
 * @file environment.js
 * @description Adds non-model scene dressing: grid helper and semi-transparent floor.
 *
 * These objects are purely cosmetic — they do not affect printer physics
 * or coordinate mapping. Keeping them isolated means they can be toggled
 * or replaced without touching any other module.
 *
 * @module scene/environment
 */

import * as THREE from 'three';
import { PRINTER_CONFIG } from '../config/printer_config.js';

const { GRID, FLOOR } = PRINTER_CONFIG.SCENE;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Adds a GridHelper and a semi-transparent floor plane to `scene`.
 *
 * Both objects sit at y = 0. The floor receives shadows; the grid does not
 * (it is a LineSegments and doesn't interact with the shadow system).
 *
 * @param {THREE.Scene} scene
 * @returns {EnvironmentObjects}
 *
 * @example
 * import { addEnvironment } from './scene/environment.js';
 *
 * const env = addEnvironment(scene);
 * env.grid.visible = false; // hide the grid at runtime
 */
export function addEnvironment(scene) {
  const grid  = _makeGrid();
  const floor = _makeFloor();

  scene.add(grid, floor);

  return { grid, floor };
}

// ── Private builders ──────────────────────────────────────────────────────────

/**
 * @returns {THREE.GridHelper}
 */
function _makeGrid() {
  const grid = new THREE.GridHelper(
    GRID.SIZE,
    GRID.DIVISIONS,
    GRID.COLOR_MAIN,
    GRID.COLOR_SUB,
  );
  grid.position.y = 0;
  return grid;
}

/**
 * @returns {THREE.Mesh}
 */
function _makeFloor() {
  const geometry = new THREE.PlaneGeometry(GRID.SIZE, GRID.SIZE);
  const material = new THREE.MeshStandardMaterial({
    color:       FLOOR.COLOR,
    roughness:   FLOOR.ROUGHNESS,
    metalness:   FLOOR.METALNESS,
    transparent: true,
    opacity:     FLOOR.OPACITY,
  });

  const floor = new THREE.Mesh(geometry, material);
  floor.rotation.x    = -Math.PI / 2;
  floor.position.y    = 0;
  floor.receiveShadow = true;

  return floor;
}

// ── JSDoc types ───────────────────────────────────────────────────────────────

/**
 * @typedef {object} EnvironmentObjects
 * @property {THREE.GridHelper} grid
 * @property {THREE.Mesh}       floor
 */
