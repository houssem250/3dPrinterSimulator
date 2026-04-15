/**
 * @file filament_renderer.js
 * @description Manages the real-time 3D rendering of deposited filament during the simulation.
 * 
 * To ensure the simulation remains physically accurate and performance-efficient, 
 * this module implements several critical strategies:
 *
 * 1. Physical Parenting (Sticky Filaments)
 *    ────────────────────────────────────────
 *    Typical 3D printing involves a moving bed (Y-axis) and a moving nozzle (X/Z). 
 *    To ensure deposited filament "sticks" to the bed and moves with it, the 
 *    `FilamentGroup` is parented directly to the "Tisch" (bed) node in the 3D scene.
 *    This allows Three.js to handle the movement of previously printed geometry 
 *    automatically via scene graph hierarchy transformations.
 *
 * 2. Coordinate and Scaling Strategy
 *    ──────────────────────────────────
 *    The underlying GLB model uses a scale of x10 applied at the root. 
 *    To work in standard world-space units (mm) without manually dividing every 
 *    coordinate by 10, we apply a scale of (1/10) to the `FilamentGroup`. 
 *    This inversion cancels the root scaling for all children of the group, 
 *    letting us use world-unit coordinates directly for geometry generation.
 *
 * 3. Accurate Nozzle Tracking
 *    ─────────────────────────
 *    Modern FDM printers have physical width. Instead of tracking the visual 
 *    center of the nozzle (which may have offsets defined for UI symmetry), 
 *    we track the `X_axis` group position directly. This ensures the filament 
 *    deposition follows the mechanical truth of the carriage motion.
 *
 * 4. Geometry Generation (Ribbon vs Tube)
 *    ──────────────────────────────────────
 *    Standard `TubeGeometry` is computationally expensive and leaves gaps 
 *    at segment boundaries. We use a custom "Ribbon" geometry that generates 
 *    continuous, overlapping rectangular extrusions. This better mimics 
 *    the physical "squish" of molten plastic against the bed or previous layers.
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
   * @param {THREE.Group} model  The specific printer group this renderer belongs to.
   * @param {THREE.Scene} scene  The global scene.
   * @param {object}  [options]
   * @param {number}  [options.color]   Filament hex colour.
   * @param {number}  [options.width]   Initial extrusion width mm.
   * @param {number}  [options.height]  Initial layer height mm.
   * @param {THREE.Vector3} [options.worldOffset] Offset of the printer in world space.
   */
  constructor(model, scene, options = {}) {
    this._model = model;
    this._scene = scene;
    this._worldOffset = options.worldOffset || new THREE.Vector3(0, 0, 0);
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
    this._xGroup = null;
    /** @type {THREE.Object3D | null} */
    this._nozzleNode = null; // Kept for potential fallback only

    // Measured in world space after matrix flush
    this._bedTopWorldY = 0;
    this._bedWidthWorldUnits = 1;

    // Nozzle offset from X_GROUP center (measured once during initialization)
    this._nozzleOffsetX = 0;
    this._nozzleOffsetY = 0;
    this._nozzleOffsetZ = 0;

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

  /**
   * Sets the effective layer height for subsequent filament deposition.
   * @param {number} h Layer height in mm.
   */
  setHeight(h) { this._layerHeightMm = h; }

  /**
   * Sets the effective extrusion width for subsequent filament deposition.
   * @param {number} w Extrusion width in mm.
   */
  setWidth(w) { this._extrudeWidthMm = w; }

  /**
   * Update X_GROUP reference (useful if group changes after construction)
   * @param {THREE.Group} xGroup
   */
  setXGroup(xGroup) {
    this._xGroup = xGroup;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Resets the entire filament rendering state.
   * Destroys existing geometry and clears internal point buffers.
   * @returns {this}
   */
  reset() {
    this._destroyGroup();
    this._currentSeg = [];
    this._segCount = 0;
    return this;
  }

  /**
   * Appends the filament deposition point based on X_GROUP motion.
   * This ensures filament follows the carriage movement, not the nozzle center.
   * Call AFTER all three axis setPosition() calls.
   */
  appendPoint() {
    if (!this._tischNode) return;

    // Flush all dirty local transforms → world matrices
    this._scene.updateWorldMatrix(true);

    // Get deposition point based on X_GROUP motion
    const worldPos = this._getDepositionWorldPos();
    const localPos = this._worldToGroupLocal(worldPos);

    this._currentSeg.push(localPos);
  }

  /** Commits active segment and starts a new one (travel/home/retract). */
  appendBreak() {
    if (!this._tischNode) return;
    this._commitSegment();
    this._currentSeg = [];
  }

  /**
   * Clears all rendered filament from the scene.
   * Unlike reset(), this also flushes active mesh trackers.
   */
  clear() {
    this._destroyGroup();
    this._currentSeg = [];
    this._segCount = 0;
    this._activeMeshes = [];
  }

  /**
   * Disposes of all geometry and materials to prevent memory leaks.
   * Should be called when the renderer is no longer needed.
   */
  dispose() {
    this.clear();
    this._meshMat.dispose();
    this._lineMat.dispose();
  }

  // ── Private: node discovery ──────────────────────────────────────────────────

  /**
   * Traverses the scene graph to find required printer nodes.
   * Initializes world-space measurements for the bed.
   * @private
   */
  _findNodes() {
    this._model.traverse((child) => {
      if (child.name === 'Tisch') this._tischNode = child;
      if (child.name === 'Druckkopf') this._nozzleNode = child;
      // Auto-find X_axis if not provided
      if (!this._xGroup && child.name === 'X_axis') this._xGroup = child;
    });

    if (!this._tischNode) {
      console.warn('FilamentRenderer: "Tisch" not found — filament disabled.');
      return;
    }
    if (!this._xGroup) {
      console.warn('FilamentRenderer: "X_axis" not found — falling back to nozzle position (may have offset issues)');
    }

    // Measure bed in world space (need fresh matrices)
    this._scene.updateWorldMatrix(true);
    const box = new THREE.Box3().setFromObject(this._tischNode);
    this._bedTopWorldY = box.max.y;
    this._bedWidthWorldUnits = box.max.x - box.min.x;

    console.log(
      `FilamentRenderer ready. ` +
      `Bed top Y=${this._bedTopWorldY.toFixed(4)}  ` +
      `width=${this._bedWidthWorldUnits.toFixed(4)} world-units`,
    );
    console.log(`FilamentRenderer: using ${this._xGroup ? 'X_GROUP' : 'NOZZLE'} for deposition tracking`);
  }

  // ── Private: coordinate helpers ──────────────────────────────────────────────

  /**
   * Returns deposition point in world space based on X_GROUP motion.
   * Applies pre-measured nozzle offset to ensure filament appears at nozzle tip.
   */
  _getDepositionWorldPos() {
    if (this._xGroup) {
      // Get the current world position of the entire X carriage assembly.
      const xGroupWorldPos = new THREE.Vector3();
      this._xGroup.getWorldPosition(xGroupWorldPos);

      // We use the X_axis group for horizontal (X/Z) positions to avoid nozzle-center offsets.
      // However, for vertical accuracy (Z in machine space, Y in world space), we 
      // use the actual nozzle tip world position. This ensures the filament is 
      // always deposited exactly at the contact point.
      return new THREE.Vector3(
        xGroupWorldPos.x,
        this._nozzleWorldPos().y,
        xGroupWorldPos.z
      );
    }

    // Fallback: use nozzle center if X_axis is not found (less accurate)
    return this._nozzleWorldPos();
  }

  /**
   * @deprecated Use X_GROUP-based deposition instead.
   * Returns nozzle tip in world space. Assumes matrices already updated.
   */
  /**
   * Calculates the world-space position of the nozzle tip.
   * @deprecated Use X_GROUP-based deposition instead for better carriage tracking.
   * @returns {THREE.Vector3} Nozzle tip position in world units.
   * @private
   */
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

  /**
   * Commits the current point buffer as a 3D geometry segment.
   * This handles the conversion from abstract points to physical geometry.
   */
  _commitSegment() {
    const pts = this._currentSeg;
    if (pts.length < 2) return;

    const grp = this._ensureGroup();

    // To prevent the GPU from being overwhelmed by millions of tiny geometries,
    // we use a dual-strategy: Ribbon geometry for high-detail printing,
    // and simple Line primitives as a fallback or for very high segment counts.
    if (this._segCount < MAX_TUBE_SEGMENTS) {
      // Cleanup: remove duplicate points to avoid degenerate triangles in the ribbon
      const uniq = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].distanceTo(pts[i - 1]) > 1e-6) uniq.push(pts[i]);
      }
      if (uniq.length < 2) return;

      // Conversion factor: mm to world units
      const suPerMm = this._bedWidthWorldUnits / PRINTER_CONFIG.hardware.bed.width;
      const w = this._extrudeWidthMm * suPerMm;
      const h = this._layerHeightMm * suPerMm;

      try {
        const geo = this._buildRibbonGeometry(uniq, w, h);
        const mesh = new THREE.Mesh(geo, this._meshMat);
        grp.add(mesh);

        // Optimization Strategy: Periodic Merging
        // Adding hundreds of individual segment meshes creates a bottleneck in draw calls.
        // We track 'active' meshes and periodically merge them into single BufferGeometry chunks.
        this._activeMeshes.push(mesh);
        if (this._activeMeshes.length >= 100) {
          this._mergeActiveMeshes(grp);
        }
      } catch (err) {
        console.warn('Ribbon geom failed:', err);
        // Fall back to simple line if the complex geometry builder fails
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
   * Generates a continuous 3D rectangular ribbon geometry.
   * Unlike standard tubes, ribbons are optimized for flat segments and 
   * predictable widths, making them ideal for FDM path visualization.
   * 
   * Strategy:
   * 1. Calculate a stable tangent (direction) and a side vector (perpendicular to UP).
   * 2. Extrude the path sideways by half-width (hw) and vertically by half-height (hh).
   * 3. Apply a 'squish' factor to the bottom to ensure the filament appears to 
   *    overlap slightly with the layer below, preventing visual floating.
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

  /**
   * Commits the current point buffer as a simple line segment.
   * Used as a fallback when high-detail geometry generation fails or is skipped.
   * @param {THREE.Vector3[]} pts Array of local-space points.
   * @param {THREE.Group} grp Target group for the line mesh.
   * @private
   */
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
   * Ensures the FilamentGroup exists and is properly calibrated.
   * 
   * Maintaining correct parenting is vital:
   * - We parent to 'Tisch' (the bed) so filament moves with Y-axis translation.
   * - We apply a 1/10 scale to negate the x10 root scale of the printer model.
   *   Without this, coordinates would be off by an order of magnitude.
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

  /**
   * Destroys the FilamentGroup and disposes of all child geometries.
   * @private
   */
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
  /**
   * @param {THREE.Scene} scene
   * @param {object} [options]
   * @param {number} [options.color=0x00ff88] Line color for the preview.
   */
  constructor(scene, options = {}) {
    this._scene = scene;
    this._color = options.color ?? 0x00ff88;
    this._mesh = null;
  }

  /**
   * Generates and displays a line preview of a G-code path.
   * @param {{x: number, y: number, z: number}[]} path Array of coordinates representing the path.
   */
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

  /**
   * Removes the path preview from the scene and disposes its resources.
   */
  clear() {
    if (!this._mesh) return;
    this._scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    this._mesh.material.dispose();
    this._mesh = null;
  }
}