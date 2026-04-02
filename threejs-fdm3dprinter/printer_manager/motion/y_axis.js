/**
 * @file y_axis.js
 * @description Y-axis motion — print bed forward ↔ backward.
 *
 * How it moves
 * ────────────
 * The bed (`Tisch`) is a child of `Y_axis`. Moving `Y_axis.position.z`
 * slides the entire bed assembly. Three.js Z maps to the physical Y axis
 * of the printer (depth direction).
 *
 * Travel limits
 * ─────────────
 * Derived from `trapezoid_screwY000`.
 *
 * @module printer_manager/motion/y_axis
 */

/**
 * @file y_axis.js
 * @description Y-axis motion — print bed forward ↔ backward.
 */

import * as THREE from 'three';
import { BaseAxis } from './base_axis.js';
import { PRINTER_CONFIG } from '../../config/printer_config.js';

const { MAX_TRAVEL_MM, SCREW_PITCH_MM } = PRINTER_CONFIG.AXES.Y;

export class YAxisMotion extends BaseAxis {

  /**
   * @param {import('../../model/model_loader.js').ModelLoader} modelLoader
   * @param {THREE.Group} printerModel
   * @param {number}      modelScale
   */
  constructor(modelLoader, printerModel, modelScale = 1) {
    super(printerModel, {
      axisName: 'Y',
      maxTravel: MAX_TRAVEL_MM,
      modelScale,
      screwPitch: SCREW_PITCH_MM,
    });

    //this.homeOffset = 0; // Change this to adjust home position (in mm)

    this.modelLoader = modelLoader;

    // Find moving parts
    this._resolveMovingParts();

    // Find bed for limit calculation
    this.bed = this.findPartByName('Tisch');

    // Find lead screws for mechanical limits
    this.trapezoidScrewY0 = this.findPartByName('trapezoid_screwY000');
    this.trapezoidScrewY1 = this.findPartByName('trapezoid_screwY001');

    // Reference for "Home" alignment
    this.xGroup = this.findPartByName('X_axis');

    // Calculate limits based on both screw geometry and bed size
    this._calculateLimits();
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  _resolveMovingParts() {
    this.yGroup = this.findPartByName('Y_axis');
    this.tisch = this.findPartByName('Tisch');

    if (this.yGroup) {
      this._movingGroup = this.yGroup;
    } else if (this.tisch) {
      this._movingGroup = this.tisch;
    } else {
      this._movingGroup = null;
      console.warn('⚠️ Y-axis: no moving parts found.');
    }
  }

  // ── Limit calculation (dual-layer constraints) ───────────────────────────

  /**
   * Intersection of Mechanical (Screw) and Print Area (Bed) constraints.
   */
  _calculateLimits() {
    // we want the start of the bed to be at the nozzle position which will be the zero local point of the bed in Y-axis
    // use the bottom side of the bed or switch in top side of the bed
    let nozzleWorldY = 0;
    let offsetWorld = 0
    if (this.xGroup || this.bed) {
      const xBox = new THREE.Box3().setFromObject(this.xGroup);
      const center = new THREE.Vector3();
      xBox.getCenter(center);
      nozzleWorldY = center.z; // The line where the nozzle "lives"
      console.warn('Y-axis: nozzleWorldY', nozzleWorldY);
      //Y-axis: nozzleWorldY -0.032222919166088104

      const bedBox = new THREE.Box3().setFromObject(this.bed);
      const bedBottomZ = bedBox.min.z; // bottom of bed
      const bedTopZ = bedBox.max.z; // top of bed 
      console.warn('Y-axis: bedBottomZ', bedBottomZ);
      console.warn('Y-axis: bedTopZ', bedTopZ);
      //Y-axis: bedBottomZ -0.19755599566280946
      //Y-axis: bedTopZ 0.15244399674713716

      // ==========================================
      // OFFSET CALCULATIONS - UNCOMMENT ONLY ONE
      // ==========================================

      // Simple positive offsets
      // offsetWorld = Math.abs(nozzleWorldY - bedTopZ);        // 0.184666
      // offsetWorld = Math.abs(nozzleWorldY - bedCenterZ);     // 0.009666
      // offsetWorld = Math.abs(nozzleWorldY - bedBottomZ);     // 0.165333

      // Simple negative offsets
      // offsetWorld = -(Math.abs(nozzleWorldY - bedTopZ));     // -0.184666
      // offsetWorld = -(Math.abs(nozzleWorldY - bedCenterZ));  // -0.009666
      // offsetWorld = -(Math.abs(nozzleWorldY - bedBottomZ));  // -0.165333

      // Direct subtraction (no abs) - can be positive or negative
      // offsetWorld = nozzleWorldY - bedTopZ;                  // -0.184666
      // offsetWorld = nozzleWorldY - bedCenterZ;               // -0.009666
      // offsetWorld = nozzleWorldY - bedBottomZ;               // 0.165333

      // Inverse subtraction
      // offsetWorld = bedTopZ - nozzleWorldY;                  // 0.184666
      // offsetWorld = bedCenterZ - nozzleWorldY;               // 0.009666
      // offsetWorld = bedBottomZ - nozzleWorldY;               // -0.165333

      // Addition combinations
      // offsetWorld = nozzleWorldY + bedTopZ;                  // 0.120221
      // offsetWorld = nozzleWorldY + bedCenterZ;               // -0.054778
      // offsetWorld = nozzleWorldY + bedBottomZ;               // -0.229778

      // Manual values [nearest value : offsetWorld = -0.054778, but need more accuarate value]
      const manualOffset = 0.004778; // I didn't calc , I assume
      // in model the bed is not 100% square but in configfile we set a fix square 
      // 0.022556 = |bedCenter in the Y axis world default - nozzle in the Y axis|
      // 0.0082 = |Difference between the width of bed and depth of bed because it's not square|
      offsetWorld = -0.022556 + (0.0082 / 4);  // Based on your actual measurements
      // offsetWorld = -0.184666;
      // offsetWorld = 0;

      /**
       * Why bed model is not square 100% ?
       * in the Y axis bed has some added meshes so they cause noisy shape example
       * instead of 350*350 there will be less or more in edge and fore that
       
       */
    }

    const screwLimits = this._getScrewLimits();
    const bedLimits = this._getBedLimits();

    console.warn('Y-axis: screwLimits', 'min', screwLimits.min, 'max', screwLimits.max);
    console.warn('Y-axis: bedLimits', 'min', bedLimits.min, 'max', bedLimits.max);

    if (bedLimits) {
      this.worldMinZ = bedLimits.min + offsetWorld;
      this.worldMaxZ = bedLimits.max + offsetWorld;
    } else if (screwLimits) {
      this.worldMinZ = screwLimits.min + offsetWorld;
      this.worldMaxZ = screwLimits.max + offsetWorld;
    } else {
      // Fallback
      const totalVisualTravel = this.maxTravel * this.modelScale;
      this.worldMinZ = -(totalVisualTravel / 2);
      this.worldMaxZ = (totalVisualTravel / 2);
    }


    console.warn('Y-axis: worldMinZ', this.worldMinZ, 'worldMaxZ', this.worldMaxZ);

    this._convertWorldLimitsToLocal();
  }

  /**
   * Layer 1: Mechanical Limits
   * Accounts for screw length minus the bed's own depth.
   */
  _getScrewLimits() {
    if (!this.trapezoidScrewY0 && !this.trapezoidScrewY1) return null;

    const screw = this.trapezoidScrewY0 || this.trapezoidScrewY1;
    const screwBox = new THREE.Box3().setFromObject(screw);

    // Compensation for bed size so it doesn't slide off the screw
    const bedHalfDepth = this._getBedHalfDepth();

    return {
      min: screwBox.min.z + bedHalfDepth,
      max: screwBox.max.z - bedHalfDepth
    };
  }

  /**
   * Layer 2: Print Area Limits
   * Uses PRINTER_CONFIG dimensions.
   */
  _getBedLimits() {
    const bedDepthMm = PRINTER_CONFIG?.hardware?.bed?.depth;

    if (bedDepthMm) {
      const bedDepthWorld = bedDepthMm * this.modelScale;
      let bedWorldCenterZ = 0;

      if (this.bed) {
        const bedBox = new THREE.Box3().setFromObject(this.bed);
        bedWorldCenterZ = (bedBox.min.z + bedBox.max.z) / 2;
      }

      const halfBedDepth = bedDepthWorld / 2;

      // Unit conversion to match X-axis implementation logic
      const bedMin = (bedWorldCenterZ - halfBedDepth) / (1000 * this.modelScale);
      const bedMax = (bedWorldCenterZ + halfBedDepth) / (1000 * this.modelScale);

      return { min: bedMin, max: bedMax };
    }

    if (this.bed) {
      const bedBox = new THREE.Box3().setFromObject(this.bed);
      return { min: bedBox.min.z, max: bedBox.max.z };
    }

    return null;
  }

  _getBedHalfDepth() {
    if (!this._movingGroup) return 0;
    const bedBox = new THREE.Box3().setFromObject(this._movingGroup);
    const size = new THREE.Vector3();
    bedBox.getSize(size);
    return size.z / 2;
  }

  _convertWorldLimitsToLocal() {
    const parentGroup = this._movingGroup?.parent;
    if (parentGroup) {
      const invWorld = new THREE.Matrix4().copy(parentGroup.matrixWorld).invert();
      const localMin = new THREE.Vector3(0, 0, this.worldMinZ).applyMatrix4(invWorld);
      const localMax = new THREE.Vector3(0, 0, this.worldMaxZ).applyMatrix4(invWorld);
      this.localMinZ = localMin.z;
      this.localMaxZ = localMax.z;
    } else {
      this.localMinZ = this.worldMinZ;
      this.localMaxZ = this.worldMaxZ;
    }
  }

  // ── Position update ─────────────────────────────────────────────────────────

  /**
   * Moves the bed. Rotation is intentionally excluded for this axis.
   */

  updatePartsPosition(positionMm) {
    if (!this._movingGroup) return;

    const t = positionMm / this.maxTravel;
    const localZ = this.localMinZ + t * (this.localMaxZ - this.localMinZ);

    this._movingGroup.position.z = localZ;
  }

  isAtFrontLimit() { return this.currentPosition <= 0; }
  isAtBackLimit() { return this.currentPosition >= this.maxTravel; }
}