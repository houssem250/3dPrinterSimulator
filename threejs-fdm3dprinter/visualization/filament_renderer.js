/**
 * @file filament_renderer.js
 * @description Renders live filament parented to the Tisch (bed) so that
 * deposited filament rides with bed movement exactly like real FDM printing.
 *
 * Coordinate strategy
 * ───────────────────
 * 1. FilamentGroup is added as a CHILD of Tisch, so it inherits Tisch's
 *    world transform and moves with the bed automatically.
 *
 * 2. The GLB model has scale ×10 applied at the root, which propagates down
 *    to Tisch. If we parent FilamentGroup to Tisch without correction, all
 *    geometry coordinates would need to be in Tisch local units (×0.1 of mm).
 *    Instead we set FilamentGroup.scale = (1/10, 1/10, 1/10) to cancel the
 *    inherited scale, letting us work in world-unit coordinates directly.
 *
 * 3. For each print point we:
 *    a. Force scene.updateMatrixWorld(true) to flush all dirty matrices.
 *    b. Read the nozzle tip world position via Box3 on Druckkopf.
 *    c. Convert world → FilamentGroup local space via the group's inverse
 *       world matrix. Because of the scale cancellation the local coords
 *       end up in the same units as world space.
 *
 * 4. When the bed moves (Y-axis), all the FilamentGroup children move with
 *    Tisch automatically — the previously deposited geometry stays "stuck"
 *    to the bed surface.
 *
 * Tube radius
 * ──────────
 *   sceneUnitsPerMm = bedWidth_worldUnits / bedWidth_mm
 *   radius = (layerHeight_mm / 2) × sceneUnitsPerMm
 * bedWidth_worldUnits is measured via Box3 on Tisch in world space.
 *
 * @module visualization/filament_renderer
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRINTER_CONFIG } from '../config/printer_config.js';

const FILAMENT_COLOR = PRINTER_CONFIG.PRINTING.FILAMENT_COLOR;
const MODEL_SCALE = PRINTER_CONFIG.MODEL.SCALE;   // 10
const TUBE_RADIAL_SEGS = 8; // previous value was 5
const MAX_TUBE_SEGMENTS = 50000; // in very old code it was 400, keep it if there is no problem

export class FilamentRenderer {

  /**
   * @param {THREE.Scene} scene
   * @param {object}  [options]
   * @param {number}  [options.color]   Filament hex colour.
   * @param {number}  [options.width]   Initial extrusion width mm.
   * @param {number}  [options.height]  Initial layer height mm.
   */
  constructor(scene, options = {}) {
    this._scene = scene;
    this._color = options.color ?? FILAMENT_COLOR;

    this._meshMat = new THREE.MeshStandardMaterial({
      color: this._color,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this._lineMat = new THREE.LineBasicMaterial({
      color: this._color,
      linewidth: 2,
    });

    /** @type {THREE.Object3D | null} */
    this._tischNode = null;
    /** @type {THREE.Object3D | null} */
    this._nozzleNode = null;

    // Measured in world space after matrix flush
    this._bedTopWorldY = 0;
    this._bedWidthWorldUnits = 1;

    this._layerHeightMm = options.height ?? 0.20;
    this._extrudeWidthMm = options.width ?? 0.45;

    /** Points in FilamentGroup local space for the active segment */
    this._currentSeg = [];
    this._segCount = 0;

    /** Meshes added to the current group that haven't been merged yet */
    this._activeMeshes = [];

    /** @type {THREE.Group | null}  Child of Tisch, scale-corrected */
    this._group = null;

    this._findNodes();
  }

  // ── Setters ─────────────────────────────────────────────────────────────────

  setHeight(h) { this._layerHeightMm = h; }
  setWidth(w) { this._extrudeWidthMm = w; }

  // ── Public API ──────────────────────────────────────────────────────────────

  reset() {
    this._destroyGroup();
    this._currentSeg = [];
    this._segCount = 0;
    return this;
  }

  /**
   * Appends the nozzle tip position (converted to FilamentGroup local space)
   * as a print point. Call AFTER all three axis setPosition() calls.
   */
  appendPoint() {
    if (!this._tischNode) return;

    // Flush all dirty local transforms → world matrices
    this._scene.updateMatrixWorld(true);

    const worldPos = this._nozzleWorldPos();
    const localPos = this._worldToGroupLocal(worldPos);
    this._currentSeg.push(localPos);
  }

  /** Commits active segment and starts a new one (travel/home/retract). */
  appendBreak() {
    if (!this._tischNode) return;
    this._commitSegment();
    this._currentSeg = [];
  }

  clear() {
    this._destroyGroup();
    this._currentSeg = [];
    this._segCount = 0;
    this._activeMeshes = [];
  }

  dispose() {
    this.clear();
    this._meshMat.dispose();
    this._lineMat.dispose();
  }

  // ── Private: node discovery ──────────────────────────────────────────────────

  _findNodes() {
    this._scene.traverse((child) => {
      if (child.name === 'Tisch') this._tischNode = child;
      if (child.name === 'Druckkopf') this._nozzleNode = child;
    });

    if (!this._tischNode) {
      console.warn('FilamentRenderer: "Tisch" not found — filament disabled.');
      return;
    }
    if (!this._nozzleNode) {
      console.warn('FilamentRenderer: "Druckkopf" not found — bed-centre fallback.');
    }

    // Measure bed in world space (need fresh matrices)
    this._scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this._tischNode);
    this._bedTopWorldY = box.max.y;
    this._bedWidthWorldUnits = box.max.x - box.min.x;

    console.log(
      `FilamentRenderer ready. ` +
      `Bed top Y=${this._bedTopWorldY.toFixed(4)}  ` +
      `width=${this._bedWidthWorldUnits.toFixed(4)} world-units`,
    );
  }

  // ── Private: coordinate helpers ──────────────────────────────────────────────

  /** Returns nozzle tip in world space. Assumes matrices already updated. */
  _nozzleWorldPos() {
    if (this._nozzleNode) {
      const nb = new THREE.Box3().setFromObject(this._nozzleNode);
      return new THREE.Vector3(
        (nb.min.x + nb.max.x) / 2,
        nb.min.y,                        // tip = bottom of nozzle mesh
        (nb.min.z + nb.max.z) / 2,
      );
    }
    // Fallback: top-centre of Tisch
    const tb = new THREE.Box3().setFromObject(this._tischNode);
    return new THREE.Vector3(
      (tb.min.x + tb.max.x) / 2,
      this._bedTopWorldY,
      (tb.min.z + tb.max.z) / 2,
    );
  }

  /**
   * Converts a world-space Vector3 to FilamentGroup local space.
   * Because FilamentGroup has scale (1/MODEL_SCALE) applied and is parented
   * to Tisch, its world matrix combines Tisch's transform with the inverse
   * scale correction. The result is in the same units as world space.
   */
  _worldToGroupLocal(worldPos) {
    const group = this._ensureGroup();
    group.updateWorldMatrix(true, false);
    const invMat = new THREE.Matrix4().copy(group.matrixWorld).invert();
    return worldPos.clone().applyMatrix4(invMat);
  }

  // ── Private: geometry ────────────────────────────────────────────────────────

  _commitSegment() {
    const pts = this._currentSeg;
    if (pts.length < 2) return;

    const grp = this._ensureGroup();

    if (this._segCount < MAX_TUBE_SEGMENTS) {
      // Remove duplicate points that are too close together
      const uniq = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].distanceTo(pts[i - 1]) > 1e-6) uniq.push(pts[i]);
      }
      if (uniq.length < 2) return;

      const suPerMm = this._bedWidthWorldUnits / PRINTER_CONFIG.hardware.bed.width;
      const w = this._extrudeWidthMm * suPerMm;
      const h = this._layerHeightMm * suPerMm;

      try {
        const geo = this._buildRibbonGeometry(uniq, w, h);
        const mesh = new THREE.Mesh(geo, this._meshMat);
        grp.add(mesh);

        // Trick #4: Buffer growing & Periodic Merging
        this._activeMeshes.push(mesh);
        if (this._activeMeshes.length >= 100) {
          this._mergeActiveMeshes(grp);
        }
      } catch (err) {
        console.warn('Ribbon geom failed:', err);
        // Fall back to simple line if geometry builder fails
        this._commitLine(pts, grp);
      }
    } else {
      this._commitLine(pts, grp);
    }

    this._segCount++;
  }

  /**
   * Merges all currently tracked individual segment meshes into one large chunk.
   * This drastically reduces draw calls for high-segment prints.
   */
  _mergeActiveMeshes(grp) {
    if (this._activeMeshes.length === 0) return;

    try {
      const geometries = this._activeMeshes.map(m => m.geometry);
      const mergedGeo = mergeGeometries(geometries);

      if (mergedGeo) {
        const mergedMesh = new THREE.Mesh(mergedGeo, this._meshMat);
        grp.add(mergedMesh);

        // Remove the individual meshes from the scene and free memory
        for (const m of this._activeMeshes) {
          grp.remove(m);
          m.geometry.dispose();
        }

        // Clear tracking list. Merged mesh stays in grp and gets destroyed by _destroyGroup.
        this._activeMeshes = [];
      }
    } catch (err) {
      console.warn('Mesh chunk merging failed:', err);
    }
  }

  /**
   * Generates a continuous 3D rectangular ribbon (Trick #1 & #2).
   * This performs much faster than TubeGeometry and leaves absolutely zero
   * gaps between extrusion paths, mimicking physical squish perfectly.
   */
  _buildRibbonGeometry(pts, w, h) {

    const N = pts.length;
    const vertices = new Float32Array(N * 4 * 3);
    const indices = [];

    const hw = w / 2;
    const hh = h / 2;
    const squish = h * 0.25;

    const side = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);

    let v = 0;

    for (let i = 0; i < N; i++) {

      const p = pts[i];

      if (i === 0) {
        dir.subVectors(pts[1], p);
      } else if (i === N - 1) {
        dir.subVectors(p, pts[i - 1]);
      } else {
        dir.subVectors(pts[i + 1], pts[i - 1]);
      }

      dir.normalize();

      // Trick #1 — stable side vector
      side.crossVectors(UP, dir).normalize();

      const left = p.clone().addScaledVector(side, hw);
      const right = p.clone().addScaledVector(side, -hw);

      const yTopLift = 0.0001; // Prevent Z-fighting with the bed, This prevents flickering.
      const yTop = p.y + hh + yTopLift;
      const yBot = p.y - hh - squish;

      // 4 vertices per point
      vertices[v++] = left.x; vertices[v++] = yTop; vertices[v++] = left.z;
      vertices[v++] = right.x; vertices[v++] = yTop; vertices[v++] = right.z;
      vertices[v++] = left.x; vertices[v++] = yBot; vertices[v++] = left.z;
      vertices[v++] = right.x; vertices[v++] = yBot; vertices[v++] = right.z;
    }

    // build faces
    for (let i = 0; i < N - 1; i++) {

      const a = i * 4;
      const b = a + 4;

      // top
      indices.push(a, a + 1, b);
      indices.push(b, a + 1, b + 1);

      // bottom
      indices.push(a + 2, b + 2, a + 3);
      indices.push(b + 2, b + 3, a + 3);

      // left
      indices.push(a, b, a + 2);
      indices.push(b, b + 2, a + 2);

      // right
      indices.push(a + 1, a + 3, b + 1);
      indices.push(b + 1, a + 3, b + 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }

  _commitLine(pts, grp) {
    const buf = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => {
      buf[i * 3] = p.x;
      buf[i * 3 + 1] = p.y;
      buf[i * 3 + 2] = p.z;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    grp.add(new THREE.Line(geo, this._lineMat));
  }

  // ── Private: group management ────────────────────────────────────────────────

  /**
   * Creates (or returns) the FilamentGroup parented to Tisch.
   * Scale is set to 1/MODEL_SCALE to cancel the ×10 inherited from the GLB root.
   * This lets us store coordinates in world-unit scale rather than Tisch-local
   * micro-units.
   */
  _ensureGroup() {
    if (!this._group) {
      this._group = new THREE.Group();
      this._group.name = 'FilamentGroup';

      // Cancel the inherited ×MODEL_SCALE from the GLB hierarchy
      const inv = 1 / MODEL_SCALE;
      this._group.scale.set(inv, inv, inv);

      // Parent to Tisch — filament now moves with the bed
      this._tischNode.add(this._group);
    }
    return this._group;
  }

  _destroyGroup() {
    if (!this._group) return;
    this._group.traverse((child) => { child.geometry?.dispose(); });
    this._group.clear();
    this._group.parent?.remove(this._group);
    this._group = null;
  }
}

// ── PathPreview ───────────────────────────────────────────────────────────────

export class PathPreview {
  constructor(scene, options = {}) {
    this._scene = scene;
    this._color = options.color ?? 0x00ff88;
    this._mesh = null;
  }

  show(path) {
    if (!path || path.length < 2) return;
    this.clear();
    const buf = new Float32Array(path.length * 3);
    path.forEach((pt, i) => {
      buf[i * 3] = pt.x;
      buf[i * 3 + 1] = pt.z;
      buf[i * 3 + 2] = pt.y;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    this._mesh = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: this._color, transparent: true, opacity: 0.35 }),
    );
    this._scene.add(this._mesh);
  }

  clear() {
    if (!this._mesh) return;
    this._scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    this._mesh.material.dispose();
    this._mesh = null;
  }
}
