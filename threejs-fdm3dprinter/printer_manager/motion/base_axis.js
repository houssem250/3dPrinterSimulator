/**
 * @file base_axis.js
 * @description Abstract base class for a single printer axis (X, Y, or Z).
 *
 * Responsibilities
 * ────────────────
 *  - Hold the current position in mm and enforce [0, maxTravel] clamping.
 *  - Drive position changes: instant (`setPosition`), animated
 *    (`animateToPosition`), and timeline-based (`playTimeline`).
 *  - Declare `updatePartsPosition()` as an abstract hook that each
 *    concrete subclass must implement to move the actual Three.js objects.
 *
 * What changed from the original
 * ───────────────────────────────
 *  - `_easeInOut()` extracted as a named private method instead of an
 *    inline ternary — the formula is non-obvious and deserves a name.
 *  - `moveToPosition()` clamps before deciding instant-vs-animated,
 *    so subclasses never receive an out-of-range value.
 *  - `playTimeline()` now logs the axis name in completion/error messages.
 *  - `home()` duration is sourced from `PRINTER_CONFIG` rather than a
 *    magic `500` literal.
 *  - Abstract guard uses a standard pattern (method name in the message)
 *    rather than a generic "must be implemented by subclass" string.
 *
 * @module printer_manager/motion/base_axis
 */

import { PRINTER_CONFIG } from '../../config/printer_config.js';

export class BaseAxis {

  /**
   * @param {import('three').Group} printerModel  Root of the loaded GLB.
   * @param {object}  config
   * @param {string}  config.axisName        Human-readable label ('X', 'Y', 'Z').
   * @param {number}  config.maxTravel        Hard travel limit in mm.
   * @param {number}  config.modelScale       Uniform scale of the GLB model.
   * @param {number}  config.screwPitch       Lead-screw pitch in mm per rotation.
   */
  constructor(printerModel, config = {}) {
    this.printerModel = printerModel;

    this.axisName   = config.axisName   ?? 'Axis';
    this.maxTravel  = config.maxTravel  ?? 220;
    this.modelScale = config.modelScale ?? 1.0;
    this.screwPitch = config.screwPitch ?? 8;

    /** Current position in mm, always within [0, maxTravel]. */
    this.currentPosition = 0;

    /** @type {Array<{ position: number, time: number }>} */
    this.timeline = [];

    this.isAnimating = false;

    /** @type {number | null} requestAnimationFrame handle for the active animation. */
    this._animationFrame = null;
  }

  // ── Part lookup ─────────────────────────────────────────────────────────────

  /**
   * Finds a named object anywhere in the printer model hierarchy.
   * Delegates to the same pattern used by `ModelLoader.findPartByName()`.
   *
   * @param {string} partName
   * @returns {import('three').Object3D | null}
   */
  findPartByName(partName) {
    if (!this.printerModel) return null;

    let found = null;
    this.printerModel.traverse((child) => {
      if (!found && child.name === partName) found = child;
    });
    return found;
  }

  // ── Position control ────────────────────────────────────────────────────────

  /**
   * Moves the axis to `position` mm.
   *
   * Clamps to [0, maxTravel] before acting. If `duration` is 0 the move
   * is instantaneous; otherwise it animates with ease-in/out.
   *
   * @param {number} position   Target position in mm.
   * @param {number} [duration] Animation duration in ms. Default 0 (instant).
   */
  moveToPosition(position, duration = 0) {
    const target = this._clamp(position);

    if (duration <= 0) {
      this.setPosition(target);
    } else {
      this.animateToPosition(target, duration);
    }
  }

  /**
   * Teleports the axis to `position` mm with no animation.
   *
   * @param {number} position
   */
  setPosition(position) {
    this.currentPosition = this._clamp(position);
    this.updatePartsPosition(this.currentPosition);
  }

  /**
   * Animates the axis from its current position to `targetPosition` mm
   * over `duration` ms using a smooth ease-in/out curve.
   *
   * Cancels any in-progress animation before starting.
   *
   * @param {number} targetPosition  Clamped before use.
   * @param {number} duration        Duration in ms.
   */
  animateToPosition(targetPosition, duration) {
    if (this._animationFrame !== null) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }

    const start     = this.currentPosition;
    const target    = this._clamp(targetPosition);
    const startTime = Date.now();

    const tick = () => {
      const elapsed  = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = this._easeInOut(progress);

      this.setPosition(start + (target - start) * eased);

      if (progress < 1) {
        this._animationFrame = requestAnimationFrame(tick);
      } else {
        this._animationFrame = null;
      }
    };

    this._animationFrame = requestAnimationFrame(tick);
  }

  // ── Timeline ────────────────────────────────────────────────────────────────

  /**
   * Sets the keyframe timeline used by `playTimeline()`.
   * Keyframes are automatically sorted by time so insertion order doesn't matter.
   *
   * @param {Array<{ position: number, time: number }>} keyframes
   */
  setTimeline(keyframes) {
    this.timeline = [...keyframes].sort((a, b) => a.time - b.time);
    console.log(`${this.axisName}-axis: timeline set — ${this.timeline.length} keyframes`);
  }

  /**
   * Plays the full timeline from the first keyframe to the last.
   * Interpolates linearly between consecutive keyframes.
   *
   * Does nothing if fewer than 2 keyframes are loaded.
   */
  playTimeline() {
    if (this.timeline.length < 2) {
      console.warn(`${this.axisName}-axis: playTimeline() needs at least 2 keyframes.`);
      return;
    }

    this.isAnimating = true;
    const startTime   = Date.now();
    const totalDur    = this.timeline[this.timeline.length - 1].time;

    const tick = () => {
      if (!this.isAnimating) return;

      const elapsed  = Date.now() - startTime;
      const progress = elapsed / totalDur;

      if (progress >= 1) {
        this.setPosition(this.timeline[this.timeline.length - 1].position);
        this.isAnimating = false;
        console.log(`${this.axisName}-axis: timeline complete.`);
        return;
      }

      // Find the active segment
      let segIdx = 0;
      for (let i = 0; i < this.timeline.length - 1; i++) {
        if (elapsed >= this.timeline[i].time && elapsed < this.timeline[i + 1].time) {
          segIdx = i;
          break;
        }
      }

      const kf1  = this.timeline[segIdx];
      const kf2  = this.timeline[segIdx + 1];
      const segT = (elapsed - kf1.time) / (kf2.time - kf1.time);

      this.setPosition(kf1.position + (kf2.position - kf1.position) * segT);
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  /** Stops a running timeline animation at the current position. */
  stopTimeline() {
    this.isAnimating = false;
    console.log(`${this.axisName}-axis: timeline stopped at ${this.currentPosition.toFixed(2)} mm.`);
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  /**
   * Animates the axis back to position 0 (home).
   * Duration is read from config so it matches the rest of the system.
   */
  home() {
    this.moveToPosition(0, PRINTER_CONFIG.PRINTING.HOME_DURATION_MS);
  }

  /** @returns {number} Current position in mm. */
  getPosition() {
    return this.currentPosition;
  }

  /**
   * Returns the axis travel range and current position.
   *
   * @returns {{ min: number, max: number, current: number, screwPitch: number }}
   */
  getRangeInfo() {
    return {
      min:        0,
      max:        this.maxTravel,
      current:    this.currentPosition,
      screwPitch: this.screwPitch,
    };
  }

  // ── Abstract hook ───────────────────────────────────────────────────────────

  /**
   * @abstract
   * Called by `setPosition()` every time the axis moves.
   * Subclasses must implement this to translate a mm value into Three.js
   * object transforms.
   *
   * @param {number} positionMm  Clamped position in mm.
   */
  updatePartsPosition(positionMm) {
    throw new Error(
      `${this.constructor.name} must implement updatePartsPosition(positionMm).`,
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Clamps `value` to [0, maxTravel].
   *
   * @param {number} value
   * @returns {number}
   */
  _clamp(value) {
    return Math.max(0, Math.min(value, this.maxTravel));
  }

  /**
   * Smooth ease-in/out curve: accelerates for the first half,
   * decelerates for the second.
   *
   * @param {number} t  Progress in [0, 1].
   * @returns {number}  Eased value in [0, 1].
   */
  _easeInOut(t) {
    return t < 0.5
      ? 2 * t * t
      : -1 + (4 - 2 * t) * t;
  }
}
