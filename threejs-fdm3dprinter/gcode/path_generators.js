/**
 * @file path_generators.js
 * @description Pure functions that build G-code-style move lists for common
 * print shapes.
 *
 * Where these came from
 * ─────────────────────
 *  `generateSquarePath()` and `generateCirclePath()` were instance methods
 *  on `PrintingMotion`. They had no dependency on `this` state beyond
 *  calling `this.loadMoves()` at the end — making them methods was a
 *  violation of SRP and made them impossible to test or reuse without
 *  constructing a full `PrintingMotion` instance.
 *
 *  `tower()` was a method on `PrintingExamples` (dev-only) despite being a
 *  pure geometric computation with no dev-tool concerns.
 *
 *  All three are now stateless functions on a `PathGenerators` namespace
 *  object. They return a plain move-list array — callers pass that to
 *  `printer.loadMoves()` themselves.
 *
 * Usage
 * ─────
 *  import { PathGenerators } from '../gcode/path_generators.js';
 *
 *  const moves = PathGenerators.square(50, 50, 100, 3);
 *  printer.loadMoves(moves).executePath();
 *
 *  const moves = PathGenerators.tower(150, 150, 40, 10);
 *  printer.loadMoves(moves).executePath();
 *
 * @module gcode/path_generators
 */

import { PRINTER_CONFIG } from '../config/printer_config.js';

const { DEFAULT_SPEED_MM_S, DEFAULT_LAYER_HEIGHT_MM, DEFAULT_EXTRUSION_WIDTH_MM = 0.45 } = PRINTER_CONFIG.PRINTING;
const { MAX_TRAVEL_MM: X_MAX } = PRINTER_CONFIG.AXES.X;
const { MAX_TRAVEL_MM: Y_MAX } = PRINTER_CONFIG.AXES.Y;

export const PathGenerators = Object.freeze({

  // ── Square ──────────────────────────────────────────────────────────────────

  /**
   * Generates a closed square perimeter, repeated for each layer.
   *
   * @param {number} [startX=50]       X coordinate of the bottom-left corner, mm.
   * @param {number} [startY=50]       Y coordinate of the bottom-left corner, mm.
   * @param {number} [size=20]         Side length, mm.
   * @param {number} [layers=1]        Number of layers to print.
   * @param {number} [speed]           Print speed, mm/s. Defaults to config value.
   * @returns {Array<object>}          Move list for `PrintingMotion.loadMoves()`.
   */
  square(
    startX = undefined,
    startY = undefined,
    size = 40,
    layers = 2,
    speed = DEFAULT_SPEED_MM_S,
  ) {
    if (startX === undefined) startX = (X_MAX - size) / 2;
    if (startY === undefined) startY = (Y_MAX - size) / 2;

    const F = speed * 60;
    const moves = [];
    let currentE = 0;
    const extrusionPerMm = 0.05;

    moves.push({ cmd: 'G28' });
    moves.push({ cmd: 'G90' });
    moves.push({ cmd: 'M82' });
    moves.push({ cmd: 'G92', E: 0 });

    for (let layer = 0; layer < layers; layer++) {
      const z = (layer + 1) * DEFAULT_LAYER_HEIGHT_MM;

      // Lift and travel to start corner
      moves.push({ cmd: 'G0', X: startX, Y: startY, Z: z, F: F * 2 });

      // Un-retract if not first layer
      if (layer > 0) {
        currentE += 1.0;
        moves.push({ cmd: 'G1', E: currentE, F: 2400 });
      }

      const moveE = size * extrusionPerMm;

      // Print one closed square
      currentE += moveE;
      moves.push({ cmd: 'G1', X: startX + size, Y: startY, Z: z, F, E: currentE });
      currentE += moveE;
      moves.push({ cmd: 'G1', X: startX + size, Y: startY + size, Z: z, F, E: currentE });
      currentE += moveE;
      moves.push({ cmd: 'G1', X: startX, Y: startY + size, Z: z, F, E: currentE });
      currentE += moveE;
      moves.push({ cmd: 'G1', X: startX, Y: startY, Z: z, F, E: currentE });

      // Retract
      currentE -= 1.0;
      moves.push({ cmd: 'G1', E: currentE, F: 2400 });
    }

    moves.push({ cmd: 'G28', X: 0, Y: 0 }); // Move bed forward

    console.log(
      `Square path: origin=(${startX.toFixed(1)},${startY.toFixed(1)}) size=${size} mm layers=${layers} moves=${moves.length}`,
    );
    return moves;
  },

  // ── Circle ──────────────────────────────────────────────────────────────────

  /**
   * Generates a circular perimeter approximated by straight segments,
   * repeated for each layer.
   *
   * @param {number} [cx=100]          Centre X, mm.
   * @param {number} [cy=100]          Centre Y, mm.
   * @param {number} [radius=20]       Radius, mm.
   * @param {number} [layers=1]        Number of layers.
   * @param {number} [segments=36]     Number of straight segments per circle.
   * @param {number} [speed]           Print speed, mm/s.
   * @returns {Array<object>}
   */
  circle(
    cx = undefined,
    cy = undefined,
    radius = 30,
    layers = 2,
    segments = 36,
    speed = DEFAULT_SPEED_MM_S,
  ) {
    if (cx === undefined) cx = X_MAX / 2;
    if (cy === undefined) cy = Y_MAX / 2;

    const F = speed * 60;
    const moves = [];
    let currentE = 0;
    const extrusionPerMm = 0.05;
    const segmentLength = (2 * Math.PI * radius) / segments;
    const moveE = segmentLength * extrusionPerMm;

    moves.push({ cmd: 'G28' });
    moves.push({ cmd: 'G90' });
    moves.push({ cmd: 'M82' });
    moves.push({ cmd: 'G92', E: 0 });

    for (let layer = 0; layer < layers; layer++) {
      const z = (layer + 1) * DEFAULT_LAYER_HEIGHT_MM;

      // Travel to first point
      const startX = cx + radius;
      const startY = cy;
      moves.push({ cmd: 'G0', X: startX, Y: startY, Z: z, F: F * 2 });

      // Un-retract if not first layer
      if (layer > 0) {
        currentE += 1.0;
        moves.push({ cmd: 'G1', E: currentE, F: 2400 });
      }

      for (let i = 1; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        currentE += moveE;
        moves.push({
          cmd: 'G1',
          X: cx + Math.cos(angle) * radius,
          Y: cy + Math.sin(angle) * radius,
          Z: z,
          F,
          E: currentE,
        });
      }

      // Retract
      currentE -= 1.0;
      moves.push({ cmd: 'G1', E: currentE, F: 2400 });
    }

    moves.push({ cmd: 'G28', X: 0, Y: 0 }); // Move bed forward

    console.log(
      `Circle path: centre=(${cx.toFixed(1)},${cy.toFixed(1)}) r=${radius} mm layers=${layers} moves=${moves.length}`,
    );
    return moves;
  },

  // ── Calibration tower ───────────────────────────────────────────────────────

  /**
   * Generates a hollow square tower — one perimeter per layer, growing in Z.
   *
   * Use this to verify all three axes are working correctly:
   *   Walls stay aligned layer-to-layer  → X and Y are correct
   *   Each layer sits above the previous → Z is correct
   *   Square is square (not rectangular) → X and Y scales match
   *
   * @param {number} [cx=150]          Centre X, mm.
   * @param {number} [cy=150]          Centre Y, mm.
   * @param {number} [size=40]         Wall side length, mm.
   * @param {number} [layers=10]       Number of layers.
   * @param {number} [layerHeight]     Layer height, mm. Defaults to config value.
   * @param {number} [speed=40]        Print speed, mm/s.
   * @returns {Array<object>}
   */
  tower(
    cx = undefined,
    cy = undefined,
    size = 40,
    layers = 10,
    layerHeight = undefined,
    speed = DEFAULT_SPEED_MM_S,
  ) {
    if (cx === undefined) cx = X_MAX / 2;
    if (cy === undefined) cy = Y_MAX / 2;
    if (layerHeight === undefined) layerHeight = DEFAULT_LAYER_HEIGHT_MM;

    const half = size / 2;
    const F = speed * 60;
    const moves = [];

    // 1. Initialize Extrusion Tracking
    let currentE = 0;
    const extrusionPerMm = 0.05;
    const extrusionWidth = 0.45; // Standard perimeter width

    // ── START G-CODE (Real Printer Routine) ────────────────
    moves.push({ cmd: 'G28' });            // Home all axes
    moves.push({ cmd: 'G90' });            // Absolute positioning
    moves.push({ cmd: 'M82' });            // Absolute extrusion mode
    moves.push({ cmd: 'G92', E: 0 });      // Reset Extruder

    // Prime Line (the line real printers draw at the edge to clean the nozzle)
    moves.push({ cmd: 'G0', X: 10, Y: 10, Z: 0.3, F: F * 2 });
    currentE += 15 * extrusionPerMm;
    moves.push({ cmd: 'G1', X: 10, Y: 100, E: currentE, F: 1200 });

    // Move to start position
    moves.push({ cmd: 'G0', Z: 5, F: F * 2 }); // Lift
    moves.push({ cmd: 'SET_WIDTH', value: extrusionWidth });

    // ── LAYER LOOP ────────────────────────────────────────
    for (let layer = 0; layer < layers; layer++) {
      const z = (layer + 1) * layerHeight;

      // Ensure the renderer knows the exact height of this layer segment
      moves.push({ cmd: 'SET_HEIGHT', value: layerHeight });

      // 1. Travel to corner
      moves.push({ cmd: 'G0', X: cx - half, Y: cy - half, Z: z, F: F * 2 });

      // 2. UN-RETRACT (Recover the 1.0mm we took out at the end of the last layer)
      // This brings E back up so the very next move starts extruding immediately
      currentE += 1.0;
      moves.push({ cmd: 'G1', E: currentE, F: 2400 });

      const moveE = size * extrusionPerMm;

      // Side 1
      currentE += moveE;
      moves.push({ cmd: 'G1', X: cx + half, Y: cy - half, Z: z, F, E: currentE });

      // Side 2
      currentE += moveE;
      moves.push({ cmd: 'G1', X: cx + half, Y: cy + half, Z: z, F, E: currentE });

      // Side 3
      currentE += moveE;
      moves.push({ cmd: 'G1', X: cx - half, Y: cy + half, Z: z, F, E: currentE });

      // Side 4
      currentE += moveE;
      moves.push({ cmd: 'G1', X: cx - half, Y: cy - half, Z: z, F, E: currentE });

      // 3. RETRACT at the end of the layer
      currentE -= 1.0;
      moves.push({ cmd: 'G1', E: currentE, F: 2400 });
    }

    // ── END G-CODE ────────────────────────────────────────
    moves.push({ cmd: 'G28', X: 0, Y: 0 }); // Move bed forward to show part
    moves.push({ cmd: 'M104', S: 0 });      // Turn off hotend (stats only)

    return moves;
  }

});
