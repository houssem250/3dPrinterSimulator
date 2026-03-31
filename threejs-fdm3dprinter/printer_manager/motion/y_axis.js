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
 * Derived from `trapezoid_screwY000`: 80% of the screw's world-space Z
 * length is used as the usable travel range to avoid hard mechanical stops.
 *
 * @module printer_manager/motion/y_axis
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
      axisName:   'Y',
      maxTravel:  MAX_TRAVEL_MM,
      modelScale,
      screwPitch: SCREW_PITCH_MM,
    });

    this.modelLoader = modelLoader;

    this._resolveMovingParts();
    this._calculateLimits();
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * Resolves the moving group (preferring `Y_axis`, falling back to `Tisch`)
   * and the two lead screws used for limit calculations.
   */
  _resolveMovingParts() {
    this.trapezoidScrewY0 = this.findPartByName('trapezoid_screwY000');
    this.trapezoidScrewY1 = this.findPartByName('trapezoid_screwY001');

    this.yGroup = this.findPartByName('Y_axis');
    this.tisch  = this.findPartByName('Tisch');

    if (this.yGroup) {
      this._movingGroup = this.yGroup;
      console.log('✅ Y-axis: using Y_axis group.');
    } else if (this.tisch) {
      this._movingGroup = this.tisch;
      console.log('✅ Y-axis: Y_axis group not found — using Tisch directly.');
    } else {
      this._movingGroup = null;
      console.warn('⚠️  Y-axis: no moving parts found.');
    }
  }

  /**
   * Calculates the usable Z-travel range from the lead screw dimensions.
   * Falls back to a default if the screw is missing.
   */
  _calculateLimits() {
    if (this.trapezoidScrewY0) {
      const box  = new THREE.Box3().setFromObject(this.trapezoidScrewY0);
      const size = new THREE.Vector3();
      box.getSize(size);

      this._travelRange  = size.z * 0.8;
      this._travelOffset = box.min.z;
    } else {
      console.warn('⚠️  Y-axis: lead screw not found — using default travel range.');
      this._travelRange  = 2.5;
      this._travelOffset = -0.3;
    }

    console.log(`✅ Y-axis: travel range ${this._travelRange.toFixed(3)} units`);
  }

  // ── Position update ─────────────────────────────────────────────────────────

  /**
   * Maps `positionMm` → Z position and moves the bed group.
   *
   * @param {number} positionMm  Already clamped by BaseAxis.setPosition().
   */
  updatePartsPosition(positionMm) {
    if (!this._movingGroup) return;

    const t       = positionMm / this.maxTravel;
    const targetZ = this._travelOffset + t * this._travelRange;

    this._movingGroup.position.z = targetZ;
  }
}
