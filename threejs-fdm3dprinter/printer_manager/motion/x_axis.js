/**
 * @file x_axis.js
 * @description X-axis motion — print-head carriage left ↔ right.
 *
 * How it moves
 * ────────────
 * `X_axis` is a GROUP that is a direct child of `Z_axis` in the Blender
 * hierarchy. Setting `X_axis.position.x` slides the entire carriage assembly
 * in one operation — no need to touch individual child parts.
 *
 * Travel limits (roller-based)
 * ────────────────────────────
 * `GalgenHorizontral` carries two static end-stop rollers named `Rollen`
 * (children of `Z_axis`, one at each end).
 * The carriage has its own roller `RollenGondel` (child of `X_axis`).
 *
 * Physical rule:
 *   LEFT  limit → RollenGondel right edge touches left  Rollen left  edge
 *   RIGHT limit → RollenGondel left  edge touches right Rollen right edge
 *
 * We read both Rollen world-X positions, subtract the carriage roller's
 * half-width, and that gives the exact visual travel range.
 *
 * Coordinate note
 * ───────────────
 * `X_axis.position.x` is LOCAL to `Z_axis`. All bounding box work is done
 * in world space, then converted back to `Z_axis` local space for the final
 * position assignment.
 *
 * @module printer_manager/motion/x_axis
 */

import * as THREE from 'three';
import { BaseAxis } from './base_axis.js';
import { PRINTER_CONFIG } from '../../config/printer_config.js';

const { MAX_TRAVEL_MM, SCREW_PITCH_MM } = PRINTER_CONFIG.AXES.X;

export class XAxisMotion extends BaseAxis {

  /**
   * @param {import('../../model/model_loader.js').ModelLoader} modelLoader
   * @param {THREE.Group} printerModel
   * @param {number}      modelScale
   */
  constructor(modelLoader, printerModel, modelScale = 1) {
    super(printerModel, {
      axisName: 'X',
      maxTravel: MAX_TRAVEL_MM,
      modelScale,
      screwPitch: SCREW_PITCH_MM,
    });

    this.modelLoader = modelLoader;

    // The group to move — confirmed child of Z_axis in Blender
    this.xGroup = this.findPartByName('X_axis');

    if (!this.xGroup) {
      console.error('X-axis: X_axis group not found — check GLB export.');
      return;
    }

    // Parts used only for limit calculation (never moved directly)
    this.galgenHorizontral = this.findPartByName('GalgenHorizontral');
    this.trapezoidScrewX = this.findPartByName('trapezoid_screwX000');
    this.rollenGondel = this.findPartByName('RollenGondel');

    this._calculateLimits();

    console.log(`✅ X-axis: group found — ${this.xGroup.children.length} children`);
  }

  // ── Limit calculation ───────────────────────────────────────────────────────

  /**
   * Computes `localMinX` and `localMaxX` from the physical roller positions.
   * Falls back to the rail extents if fewer than 2 end-stop rollers are found.
   */
  _calculateLimits() {
    if (!this.xGroup || !this.rollenGondel) {
      console.warn('X-axis: cannot calculate limits — missing xGroup or RollenGondel.');
      const totalVisualTravel = this.maxTravel * this.modelScale; // 300 * 10 = 3000
      this.localMinX = -(totalVisualTravel / 2);
      this.localMaxX = (totalVisualTravel / 2);
      return;
    }

    const rollenHalfWidth = this._getCarriageRollerHalfWidth();
    const stopRollers = this._collectEndStopRollers();

    if (stopRollers.length < 2) {
      this._applyRailFallbackLimits(rollenHalfWidth);
    } else {
      this._applyRollerLimits(stopRollers, rollenHalfWidth);
    }

    this._convertWorldLimitsToLocal();

    console.log(`   X-axis limits  world: ${this.worldMinX.toFixed(4)} → ${this.worldMaxX.toFixed(4)}`);
    console.log(`                  local: ${this.localMinX.toFixed(4)} → ${this.localMaxX.toFixed(4)}`);
    console.log(`                  travel: ${(this.localMaxX - this.localMinX).toFixed(4)} units`);
  }

  /** @returns {number} Half the world-space width of the carriage roller. */
  _getCarriageRollerHalfWidth() {
    const box = new THREE.Box3().setFromObject(this.rollenGondel);
    const size = new THREE.Vector3();
    box.getSize(size);
    return size.x / 2;
  }

  /**
   * Collects all `Rollen` objects that are NOT the carriage roller.
   * @returns {THREE.Box3[]}
   */
  _collectEndStopRollers() {
    const boxes = [];
    this.printerModel.traverse((child) => {
      if (child.name === 'Rollen' && child !== this.rollenGondel) {
        boxes.push(new THREE.Box3().setFromObject(child));
      }
    });
    return boxes;
  }

  /**
   * Falls back to using `GalgenHorizontral` rail extents when end-stop
   * rollers cannot be found.
   *
   * @param {number} rollenHalfWidth
   */
  _applyRailFallbackLimits(rollenHalfWidth) {
    console.warn('X-axis: fewer than 2 Rollen found — falling back to rail limits.');
    if (this.galgenHorizontral) {
      const railBox = new THREE.Box3().setFromObject(this.galgenHorizontral);
      this.worldMinX = railBox.min.x + rollenHalfWidth;
      this.worldMaxX = railBox.max.x - rollenHalfWidth;
    } else {
      this.worldMinX = -0.5;
      this.worldMaxX = 0.5;
    }
  }

  /**
   * Sets world limits from the two outermost end-stop roller boxes.
   *
   * @param {THREE.Box3[]} stopRollers
   * @param {number}       rollenHalfWidth
   */
  _applyRollerLimits(stopRollers, rollenHalfWidth) {
    stopRollers.sort((a, b) => a.min.x - b.min.x);
    const leftStop = stopRollers[0];
    const rightStop = stopRollers[stopRollers.length - 1];

    // Carriage roller centre when touching the left stop
    this.worldMinX = leftStop.min.x + rollenHalfWidth;
    // Carriage roller centre when touching the right stop
    this.worldMaxX = rightStop.max.x - rollenHalfWidth;
  }

  /**
   * Converts `worldMinX` / `worldMaxX` into local X coordinates relative
   * to the Z_axis parent transform.
   */
  _convertWorldLimitsToLocal() {
    const zAxisGroup = this.xGroup.parent;

    if (zAxisGroup) {
      const invWorld = new THREE.Matrix4().copy(zAxisGroup.matrixWorld).invert();
      const localMin = new THREE.Vector3(this.worldMinX, 0, 0).applyMatrix4(invWorld);
      const localMax = new THREE.Vector3(this.worldMaxX, 0, 0).applyMatrix4(invWorld);
      this.localMinX = localMin.x;
      this.localMaxX = localMax.x;
    } else {
      // No parent transform — world == local
      this.localMinX = this.worldMinX;
      this.localMaxX = this.worldMaxX;
    }
  }

  // ── Position update ─────────────────────────────────────────────────────────

  /**
   * Maps `positionMm` → local X and moves the carriage group.
   * Also rotates the lead screw proportionally.
   *
   * @param {number} positionMm  Already clamped by BaseAxis.setPosition().
   */
  updatePartsPosition(positionMm) {
    if (!this.xGroup) return;

    // Map mm [0 … maxTravel] → local X [localMinX … localMaxX]
    const t = positionMm / this.maxTravel;
    const localX = this.localMinX + t * (this.localMaxX - this.localMinX);

    this.xGroup.position.x = localX;

    // Rotate lead screw: full rotation per screwPitch mm of travel
    if (this.trapezoidScrewX) {
      this.trapezoidScrewX.rotation.x = (positionMm / this.screwPitch) * Math.PI * 2;
    }
  }

    /**
   * Keeps each cable mesh visually connected between its fixed frame anchor
   * and the moving carriage attach-point every frame.
   *
   * Algorithm (all in Z_axis local space, X component only):
   *   1. Get the attach-target's current world-X centre.
   *   2. Convert both fixedWorldX and targetWorldX → Z_axis local X.
   *   3. New cable local-X  = midpoint of the two local endpoints.
   *   4. New cable scale.x  = |gap| / originalSize  (stretches to fill exactly).
   *
   * This guarantees the cable mesh always touches both endpoints regardless
   * of how far the carriage has moved.
   *
   * @param {number} _positionMm  Unused — we read live world positions instead.
   * @deprecated This method is unused and body is removed , it should be reimplemented when there is time to fix elasticity bugs.
   * It should be called at the end of updatePartsPosition() once the carriage has moved, but currently it causes severe visual bugs and is left out until a proper fix can be implemented.
   */
  _updateCableElasticity(_positionMm) {
    if (this.cableParts.length === 0) return;
  }

  // ── Convenience predicates ──────────────────────────────────────────────────

  /** @returns {boolean} True when the carriage is at or below position 0. */
  isAtLeftLimit() { return this.currentPosition <= 0; }

  /** @returns {boolean} True when the carriage is at or above maxTravel. */
  isAtRightLimit() { return this.currentPosition >= this.maxTravel; }
}
