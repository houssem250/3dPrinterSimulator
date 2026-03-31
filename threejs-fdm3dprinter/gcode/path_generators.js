/**
 * @file path_generators.js
 * @description Stateless geometric path generators for common 3D printing primitives.
 *
 * This module provides functions to programmatically generate G-code-style 
 * move lists without requiring a physical .gcode file.
 *
 * Refactoring History & Design Patterns:
 * ──────────────────────────────────────
 * Previously, these generators were mixed into the `PrintingMotion` and 
 * `PrintingExamples` classes. They have been refactored into a stateless 
 * `PathGenerators` namespace to adhere to the Single Responsibility Principle (SRP).
 * 
 * Benefits of this approach:
 * 1. Testability: These functions are pure mathematical computations that can 
 *    be unit-tested without initializing a Three.js scene or motion controller.
 * 2. Reusability: Any part of the application can now generate these paths 
 *    independently.
 * 3. Maintainability: Geometric logic is separated from hardware execution logic.
 *
 * Usage:
 * ──────
 * Callers receive a plain array of move objects which can be passed directly 
 * to `printer.loadMoves(moves)`.
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
   * @param {number} [startX]          X coordinate of the bottom-left corner, mm. Defaults to centering on bed.
   * @param {number} [startY]          Y coordinate of the bottom-left corner, mm. Defaults to centering on bed.
   * @param {number} [size=40]         Side length, mm.
   * @param {number} [layers=2]        Number of layers to print.
   * @param {number} [speed=40]        Print speed, mm/s. Defaults to config value.
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
    // We use a fixed extrusion factor (0.05 mm of filament per mm of travel) 
    // for these simple geometric shapes. In real slicing, this would be 
    // calculated based on nozzle diameter and layer height.
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
   * @param {number} [cx]              Centre X, mm. Defaults to bed center.
   * @param {number} [cy]              Centre Y, mm. Defaults to bed center.
   * @param {number} [radius=30]       Radius, mm.
   * @param {number} [layers=2]        Number of layers.
   * @param {number} [segments=36]     Number of straight segments per circle.
   * @param {number} [speed=40]        Print speed, mm/s.
   * @returns {Array<object>}          Move list for `PrintingMotion.loadMoves()`.
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
    // Fixed extrusion factor for simple geometry (0.05 mm filament/mm travel).
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
   * @param {number} [cx]              Centre X, mm. Defaults to bed center.
   * @param {number} [cy]              Centre Y, mm. Defaults to bed center.
   * @param {number} [size=40]         Wall side length, mm.
   * @param {number} [layers=10]       Number of layers.
   * @param {number} [layerHeight]     Layer height, mm. Defaults to config value.
   * @param {number} [speed=40]        Print speed, mm/s.
   * @returns {Array<object>}          Move list for `PrintingMotion.loadMoves()`.
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
    // Standard extrusion factor for calibration paths (0.05 mm filament/mm travel).
    const extrusionPerMm = 0.05;
    const extrusionWidth = 0.45; // Standard perimeter width

    // ── START G-CODE (Real Printer Routine) ────────────────
    moves.push({ cmd: 'G28' });            // Home all axes
    moves.push({ cmd: 'G90' });            // Absolute positioning
    moves.push({ cmd: 'M82' });            // Absolute extrusion mode
    moves.push({ cmd: 'G92', E: 0 });      // Reset Extruder

    // Prime Line Implementation:
    // real-world printers often draw a line at the edge of the bed to 
    // equalize pressure inside the nozzle and remove charred plastic.
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

      // 2. UN-RETRACT Strategy:
      // Slicers retract filament at the end of a path to prevent stringing. 
      // Before starting the next layer, we must recover that 1.0mm so that 
      // the melt zone is pressurized and plastic flows immediately.
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
