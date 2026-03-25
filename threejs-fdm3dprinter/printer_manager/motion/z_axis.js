/**
 * @file z_axis.js
 * @description Z-axis motion — gantry up ↔ down.
 *
 * How it moves
 * ────────────
 * The entire gantry (`Z_axis` group) moves vertically by setting
 * `Z_axis.position.y`. This carries the X-axis carriage and everything
 * attached to it.
 *
 * Travel limits (physical collision-based)
 * ─────────────────────────────────────────
 * Upper limit: `Klammernvertikal` (gantry clamp) hits `U_trapezoid001`
 *              (the screw ceiling bracket).
 * Lower limit: `Nevelierungsschalter` (levelling switch) hits `Tisch` (bed).
 *
 * Both limits are measured from the loaded model geometry so the simulation
 * stays in sync with the actual Blender file.
 *
 * @module printer_manager/motion/z_axis
 */

import * as THREE from 'three';
import { BaseAxis } from './base_axis.js';
import { PRINTER_CONFIG } from '../../config/printer_config.js';

const { MAX_TRAVEL_MM, SCREW_PITCH_MM } = PRINTER_CONFIG.AXES.Z;

/** Default delta range used when physical parts cannot be measured. */
const fallbackRangeMax = (PRINTER_CONFIG.AXES.Z.MAX_TRAVEL_MM / 100);
const FALLBACK_DELTA = Object.freeze({ min: 0, max: fallbackRangeMax });

export class ZAxisMotion extends BaseAxis {

  /**
   * @param {import('../../model/model_loader.js').ModelLoader} modelLoader
   * @param {THREE.Group} printerModel
   * @param {number}      modelScale
   */
  constructor(modelLoader, printerModel, modelScale = 1) {
    super(printerModel, {
      axisName:   'Z',
      maxTravel:  MAX_TRAVEL_MM,
      modelScale,
      screwPitch: SCREW_PITCH_MM,
    });

    this.modelLoader = modelLoader;

    this._resolveMovingParts();
    this._calculatePhysicalLimits();
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * Resolves the Z_axis group (preferred) or falls back to a list of
   * individual named parts that move together.
   */
  _resolveMovingParts() {
    this.trapezoidScrewZ0 = this.findPartByName('trapezoid_screwZ000');
    this.trapezoidScrewZ1 = this.findPartByName('trapezoid_screwZ001');

    this.zGroup = this.findPartByName('Z_axis');

    if (this.zGroup) {
      this._initialY = this.zGroup.position.y;
      console.log('✅ Z-axis: using Z_axis group.');
    } else {
      // Fallback: move individual parts that constitute the gantry
      const partNames = [
        'GalgenHorizontral',
        'X_axis',
        'MotorHorizontal',
        'Extruder',
        'Feder',
        'Bolt003',
      ];

      this._individualParts = partNames
        .map((name) => {
          const obj = this.findPartByName(name);
          return obj ? { obj, initialY: obj.position.y } : null;
        })
        .filter(Boolean);

      console.log(`✅ Z-axis: Z_axis group not found — moving ${this._individualParts.length} individual parts.`);
    }
  }

  /**
   * Calculates the usable Y-delta range from physical collision geometry.
   *
   * `maxDelta` — how far up the gantry can travel before Klammernvertikal
   *             hits the U_trapezoid001 ceiling.
   * `minDelta` — how far down before Nevelierungsschalter hits the bed.
   */
  _calculatePhysicalLimits() {
    const ceiling = this.findPartByName('U_trapezoid001');
    const clamp   = this.findPartByName('Klammernvertikal');
    const bed     = this.findPartByName('Tisch');
    const sensor  = this.findPartByName('Nevelierungsschalter');

    if (!ceiling || !clamp || !bed || !sensor) {
      console.warn('⚠️  Z-axis: missing parts for limit calculation — using defaults.');
      this._minDelta = FALLBACK_DELTA.min;
      this._maxDelta = FALLBACK_DELTA.max;
      return;
    }

    const ceilingBox = new THREE.Box3().setFromObject(ceiling);
    const clampBox   = new THREE.Box3().setFromObject(clamp);
    const bedBox     = new THREE.Box3().setFromObject(bed);
    const sensorBox  = new THREE.Box3().setFromObject(sensor);

    this._maxDelta = ceilingBox.min.y - clampBox.max.y;  // upward clearance
    this._minDelta = bedBox.max.y     - sensorBox.min.y; // downward clearance

    console.log(`✅ Z-axis: limits  up=${this._maxDelta.toFixed(3)}  down=${this._minDelta.toFixed(3)} units`);
  }

  // ── Position update ─────────────────────────────────────────────────────────

  /**
   * Maps `positionMm` → Y delta and moves the gantry group (or individual
   * parts if the group wasn't found).
   *
   * @param {number} positionMm  Already clamped by BaseAxis.setPosition().
   */
  updatePartsPosition(positionMm) {
    const t     = positionMm / this.maxTravel;
    const delta = this._minDelta + t * (this._maxDelta - this._minDelta);

    if (this.zGroup) {
      this.zGroup.position.y = this._initialY + delta;
    } else {
      this._individualParts.forEach(({ obj, initialY }) => {
        obj.position.y = initialY + delta;
      });
    }
  }
}
