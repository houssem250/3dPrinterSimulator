/**
 * @file filament_renderer.js
 * @description Renders live filament as a Three.js line parented to the bed,
 * riding with bed movement automatically.
 *
 * Changes from the original
 * ──────────────────────────
 *  1. reset() added — called by executePath() at the start of every run
 *     to clear the previous mesh before drawing new filament.
 *
 *  2. appendBreak() added — called by printing_motion after every G0
 *     (travel) and G28 (home) move. Starts a new segment so no connector
 *     line is drawn between separate print segments.
 *
 *  3. Single BufferGeometry replaced with a THREE.Group of segments.
 *     The original used ONE continuous geometry. A single NaN-gap approach
 *     was tried but THREE.BufferGeometry.computeBoundingSphere() throws
 *     warnings on NaN position values every frame. Instead, each segment
 *     between travel moves becomes its own THREE.Line — no NaN anywhere.
 *
 *  4. appendPoint() still reads the nozzle world position from Druckkopf.
 *     This works because printing_motion.js calls setPosition() on all
 *     axes right before appendPoint(), guaranteeing the world matrix is
 *     exact at any speedMultiplier value.
 *
 * @module visualization/filament_renderer
 */

import * as THREE from 'three';
import { PRINTER_CONFIG } from '../config/printer_config.js';

export class FilamentRenderer {

  /**
   * @param {THREE.Scene} scene
   * @param {object}  [options]
   * @param {number}  [options.color]  Filament line color hex.
   */
  constructor(scene, options = {}) {
    this._scene = scene;
    this._color = options.color ?? PRINTER_CONFIG.PRINTING.FILAMENT_COLOR;

    /** @type {THREE.Object3D | null} */
    this._tischNode  = null;
    /** @type {THREE.Object3D | null} */
    this._nozzleNode = null;

    /** World-space Y of the bed top surface. */
    this._bedTopY = 0;

    /**
     * Array of segments. Each is an array of {x,y,z} points in Tisch local space.
     * appendBreak() starts a new segment. Each segment → one THREE.Line.
     * @type {Array<Array<{x:number,y:number,z:number}>>}
     */
    this._segments = [[]];

    /**
     * Group holding one THREE.Line per segment, parented to Tisch.
     * @type {THREE.Group | null}
     */
    this._group = null;

    this._findSceneNodes();
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  _findSceneNodes() {
    this._scene.traverse((child) => {
      if (child.name === 'Tisch')     this._tischNode  = child;
      if (child.name === 'Druckkopf') this._nozzleNode = child;
    });

    if (!this._tischNode) {
      console.warn('FilamentRenderer: Tisch not found — live filament disabled.');
      return;
    }
    if (!this._nozzleNode) {
      console.warn('FilamentRenderer: Druckkopf not found — falling back to bed centre.');
    }

    this._tischNode.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this._tischNode);
    this._bedTopY = box.max.y;
    console.log(`FilamentRenderer ready.  Bed top Y: ${this._bedTopY.toFixed(4)}`);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Clears all geometry and resets for a fresh print run.
   * Called automatically by PrintingMotion.executePath() at run start.
   * @returns {this}
   */
  reset() {
    this._destroyGroup();
    this._segments = [[]];
    return this;
  }

  /**
   * Appends a filament deposit point after a G1 move.
   * Reads the nozzle world position from Druckkopf directly — correct
   * because printing_motion.js snaps all axes with setPosition() first.
   */
  appendPoint(_gcodeX, _gcodeY, _gcodeZ) {
    if (!this._tischNode) return;

    const worldPos = this._readNozzleWorldPosition();
    const local    = this._worldToTischLocal(worldPos);

    this._segments[this._segments.length - 1].push(local);
    this._rebuildLastSegment();
  }

  /**
   * Starts a new segment after a G0 (travel) or G28 (home) move.
   * Prevents a connector line being drawn between separate print segments.
   */
  appendBreak() {
    if (!this._tischNode) return;
    // Only start a new segment if the current one has points
    if (this._segments[this._segments.length - 1].length > 0) {
      this._segments.push([]);
    }
  }

  /**
   * Removes all filament from the scene.
   * Preserves cached Tisch/nozzle references for subsequent prints.
   */
  clear() {
    this._destroyGroup();
    this._segments = [[]];
    console.log('FilamentRenderer: cleared.');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _readNozzleWorldPosition() {
    if (this._nozzleNode) {
      this._nozzleNode.updateWorldMatrix(true, true);
      const nb = new THREE.Box3().setFromObject(this._nozzleNode);
      return {
        x: (nb.min.x + nb.max.x) / 2,
        y: nb.min.y,
        z: (nb.min.z + nb.max.z) / 2,
      };
    }
    this._tischNode.updateWorldMatrix(true, true);
    const tb = new THREE.Box3().setFromObject(this._tischNode);
    return {
      x: (tb.min.x + tb.max.x) / 2,
      y: this._bedTopY,
      z: (tb.min.z + tb.max.z) / 2,
    };
  }

  _worldToTischLocal(world) {
    const invMat = new THREE.Matrix4()
      .copy(this._tischNode.matrixWorld)
      .invert();
    const local = new THREE.Vector3(world.x, world.y, world.z)
      .applyMatrix4(invMat);
    return { x: local.x, y: local.y, z: local.z };
  }

  _ensureGroup() {
    if (!this._group) {
      this._group = new THREE.Group();
      (this._tischNode ?? this._scene).add(this._group);
    }
    return this._group;
  }

  /** Rebuilds only the last (active) segment's Line — earlier segments untouched. */
  _rebuildLastSegment() {
    const segIdx = this._segments.length - 1;
    const pts    = this._segments[segIdx];
    if (pts.length < 2) return;

    const group = this._ensureGroup();

    // Remove previous Line for this segment (always the last child)
    if (group.children.length > segIdx) {
      const old = group.children[segIdx];
      group.remove(old);
      if (old.geometry) old.geometry.dispose();
      if (old.material) old.material.dispose();
    }

    const positions = new Float32Array(pts.length * 3);
    pts.forEach((pt, i) => {
      positions[i * 3]     = pt.x;
      positions[i * 3 + 1] = pt.y;
      positions[i * 3 + 2] = pt.z;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    group.add(new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: this._color, linewidth: 2 }),
    ));
  }

  _destroyGroup() {
    if (!this._group) return;
    this._group.children.slice().forEach((child) => {
      this._group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    if (this._group.parent) this._group.parent.remove(this._group);
    this._group = null;
  }
}

// ── PathPreview ───────────────────────────────────────────────────────────────

export class PathPreview {

  constructor(scene, options = {}) {
    this._scene     = scene;
    this._color     = options.color     ?? 0x00ff88;
    this._mmToScene = options.mmToScene ?? 0.1;
    this._mesh      = null;
  }

  show(path) {
    if (!path || path.length < 2) {
      console.warn('PathPreview.show(): need at least 2 points.');
      return;
    }
    this.clear();

    const scale     = this._mmToScene;
    const positions = new Float32Array(path.length * 3);
    path.forEach((pt, i) => {
      positions[i * 3 + 0] = pt.x * scale;
      positions[i * 3 + 1] = pt.z * scale;
      positions[i * 3 + 2] = pt.y * scale;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._mesh = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: this._color, linewidth: 2 }),
    );
    this._scene.add(this._mesh);
    console.log(`PathPreview: showing ${path.length} points.`);
  }

  clear() {
    if (!this._mesh) return;
    this._scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    this._mesh.material.dispose();
    this._mesh = null;
    console.log('PathPreview: cleared.');
  }
}
