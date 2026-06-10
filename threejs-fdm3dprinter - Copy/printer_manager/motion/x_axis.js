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
 * Travel limits (dual-layer constraint)
 * ─────────────────────────────────────
 * The X-axis travel range is constrained by TWO factors:
 *   1. Lead screw physical length (trapezoid_screwX000 geometry)
 *   2. Bed width (from PRINTER_CONFIG.hardware.bed.width)
 * 
 * The final limits are the intersection (argmin) of both constraints,
 * ensuring the carriage stays within both mechanical and print bed limits.
 *
 * Coordinate note
 * ───────────────
 * `X_axis.position.x` is LOCAL to `Z_axis`. The limits are calculated
 * in world space from geometry and bed dimensions, then converted to local
 * space for the final position assignment.
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

    // Lead screw part for rotation and limit calculation
    this.trapezoidScrewX = this.findPartByName('trapezoid_screwX000');

    // Find bed part for limit calculation
    this.bed = this.findPartByName('bed') || this.findPartByName('Bed');

    // Calculate limits based on both screw geometry and bed size
    this._calculateLimits();

    console.log(`✅ X-axis: group found — ${this.xGroup.children.length} children`);
  }

  // ── Limit calculation ───────────────────────────────────────────────────────

  /**
   * Calculates travel limits based on TWO constraints:
   *   1. Lead screw geometry (mechanical limit)
   *   2. Bed width (print area limit)
   * Final limits are the intersection (min/max) of both.
   */
  _calculateLimits() {
    // Get limits from lead screw (mechanical constraint)
    const screwLimits = this._getScrewLimits();

    // Get limits from bed (print area constraint)
    const bedLimits = this._getBedLimits();

    // Combine constraints: take the most restrictive (inner) limits
    // This is the argmin of the two constraint ranges
    if (screwLimits && bedLimits) {
      // World limits are the intersection of both constraints
      this.worldMinX = Math.max(screwLimits.min, bedLimits.min);
      this.worldMaxX = Math.min(screwLimits.max, bedLimits.max);
      console.log('worldMinX', this.worldMinX, 'worldMaxX', this.worldMaxX);

      console.log(`X-axis: combined limits (intersection of screw + bed):`);
      console.log(`   Screw limits: ${screwLimits.min.toFixed(4)} → ${screwLimits.max.toFixed(4)}`);
      console.log(`   Bed limits:   ${bedLimits.min.toFixed(4)} → ${bedLimits.max.toFixed(4)}`);
      console.log(`   Combined:     ${this.worldMinX.toFixed(4)} → ${this.worldMaxX.toFixed(4)}`);
    }
    else if (screwLimits) {
      // Only screw limits available
      this.worldMinX = screwLimits.min;
      this.worldMaxX = screwLimits.max;
      console.warn('X-axis: using only screw limits (bed not found)');
    }
    else if (bedLimits) {
      // Only bed limits available
      this.worldMinX = bedLimits.min;
      this.worldMaxX = bedLimits.max;
      console.warn('X-axis: using only bed limits (screw not found)');
    }
    else {
      // Fallback to symmetric limits based on maxTravel
      console.warn('X-axis: no constraints found — falling back to symmetric limits');
      const totalVisualTravel = this.maxTravel * this.modelScale;
      this.worldMinX = -(totalVisualTravel / 2);
      this.worldMaxX = (totalVisualTravel / 2);
    }

    // Convert world limits to local coordinates relative to Z_axis parent
    this._convertWorldLimitsToLocal();

    console.log(`X-axis: final local travel range: ${this.localMinX.toFixed(4)} → ${this.localMaxX.toFixed(4)}`);
  }

  /**
   * Gets travel limits based on the lead screw geometry.
   * @returns {Object|null} {min, max} world X positions, or null if screw not found
   */
  _getScrewLimits() {
    if (!this.trapezoidScrewX) {
      console.warn('X-axis: trapezoid_screwX000 not found — cannot calculate screw limits');
      return null;
    }

    // Get the world-space bounding box of the lead screw
    const screwBox = new THREE.Box3().setFromObject(this.trapezoidScrewX);

    // Get the world-space X extents of the lead screw
    const screwWorldMinX = screwBox.min.x;
    const screwWorldMaxX = screwBox.max.x;

    // Calculate how much space the carriage itself occupies
    const carriageHalfWidth = this._getCarriageHalfWidth();

    // The carriage center can travel from (screw start + carriage half-width) 
    // to (screw end - carriage half-width)
    console.warn('screw min', screwWorldMinX + carriageHalfWidth, 'screw max', screwWorldMaxX - carriageHalfWidth);
    return {
      min: screwWorldMinX + carriageHalfWidth,
      max: screwWorldMaxX - carriageHalfWidth
    };
  }

  /**
   * Gets travel limits based on the bed geometry.
   * @returns {Object|null} {min, max} world X positions, or null if bed not found
   */
  _getBedLimits() {
    // First try to use config bed width if available
    const bedWidthMm = PRINTER_CONFIG?.hardware?.bed?.width;

    if (bedWidthMm) {
      // Convert bed width from mm to world units using model scale
      const bedWidthWorld = bedWidthMm * this.modelScale;

      // Get the bed's world position if available
      let bedWorldCenterX = 0;

      if (this.bed) {
        // If bed part exists, use its center position
        const bedBox = new THREE.Box3().setFromObject(this.bed);
        bedWorldCenterX = (bedBox.min.x + bedBox.max.x) / 2;
      } else {
        // No bed part found, assume bed is centered at origin
        console.warn('X-axis: bed part not found — assuming centered at origin');
        bedWorldCenterX = 0;
      }

      // Calculate bed limits based on width and center position (in world units)
      const halfBedWidth = bedWidthWorld / 2;
      // convert to unit (m) and unscale
      const bedMin = (bedWorldCenterX - halfBedWidth) / (1000 * this.modelScale);
      const bedMax = (bedWorldCenterX + halfBedWidth) / (1000 * this.modelScale);

      console.log(`X-axis: bed limits (world units): ${bedMin.toFixed(4)} → ${bedMax.toFixed(4)}`);

      return {
        min: bedMin,
        max: bedMax
      };
    }

    // Fallback: try to get limits from bed geometry if available
    if (this.bed) {
      const bedBox = new THREE.Box3().setFromObject(this.bed);
      console.log(`X-axis: bed geometry limits: ${bedBox.min.x.toFixed(4)} → ${bedBox.max.x.toFixed(4)}`);
      return {
        min: bedBox.min.x,
        max: bedBox.max.x
      };
    }

    console.warn('X-axis: no bed width in config and no bed part found');
    return null;
  }

  /**
   * Gets the half-width of the X_axis carriage group in world space.
   * @returns {number} Half the width of the carriage
   */
  _getCarriageHalfWidth() {
    if (!this.xGroup) return 0;

    const carriageBox = new THREE.Box3().setFromObject(this.xGroup);
    const size = new THREE.Vector3();
    carriageBox.getSize(size);

    // Return half the X-dimension (width)
    return size.x / 2;
  }

  /**
   * Converts world-space limits to local coordinates relative to Z_axis parent.
   */
  _convertWorldLimitsToLocal() {
    const zAxisGroup = this.xGroup.parent;

    if (zAxisGroup) {
      // Create inverse world matrix of the parent (Z_axis)
      const invWorld = new THREE.Matrix4().copy(zAxisGroup.matrixWorld).invert();

      // Convert world min and max to local space
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

    // Map mm [0 … maxTravel] to local X [localMinX … localMaxX]
    const t = positionMm / this.maxTravel;
    const localX = this.localMinX + t * (this.localMaxX - this.localMinX);

    this.xGroup.position.x = localX;

    // Rotate lead screw: full rotation per screwPitch mm of travel
    if (this.trapezoidScrewX) {
      this.trapezoidScrewX.rotation.x = (positionMm / this.screwPitch) * Math.PI * 2;
    }
  }

  /**
   * @deprecated Cable elasticity is not implemented — will be reimplemented
   * when there is time to fix elasticity bugs. Currently a no-op.
   * @param {number} _positionMm  Unused.
   */
  _updateCableElasticity(_positionMm) {
    // no-op — cableParts not initialised
  }

  // ── Convenience predicates ──────────────────────────────────────────────────

  /** @returns {boolean} True when the carriage is at or below position 0. */
  isAtLeftLimit() {
    return this.currentPosition <= 0;
  }

  /** @returns {boolean} True when the carriage is at or above maxTravel. */
  isAtRightLimit() {
    return this.currentPosition >= this.maxTravel;
  }
}