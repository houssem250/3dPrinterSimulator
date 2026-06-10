  /**
   * @file gcode_cmd.js
   * @description Mapping of G-code commands to their effects on the printer's state.
   * 
   * This file defines which G-code commands affect which configuration values in the digital shadow.
   * It serves as a reference for how G-code instructions mutate the printer's state during simulation.
   */
  
  // ===========================================================================
  // G-CODE MUTABILITY MAPPING
  // ===========================================================================
  // Defines which G-code commands affect which config values
  export const GCODE_MUTATIONS = Object.freeze({
    // Motion
    G1: { affects: ["motion.feedrate"], notes: "F parameter overrides feedrate" },
    G90: { affects: ["modes.positioning"], value: "absolute" },
    G91: { affects: ["modes.positioning"], value: "relative" },
    G92: { affects: ["position.absolute"], notes: "Set current position" },
    
    // Speed/acceleration
    M220: { affects: ["motion.speedMultiplier"], range: [0, 100], notes: "Speed factor %" },
    M204: { affects: ["motion.acceleration"], params: { S: "print", P: "print", T: "travel" } },
    M205: { affects: ["motion.jerk"], params: { X: "x", Y: "y", Z: "z", E: "e" } },
    
    // Extrusion
    M82: { affects: ["modes.extrusion"], value: "absolute" },
    M83: { affects: ["modes.extrusion"], value: "relative" },
    M221: { affects: ["extrusion.multiplier"], range: [0.5, 1.5], notes: "Flow rate % / 100" },
    
    // Temperature
    M104: { affects: ["temperature.nozzle.target"], range: [0, 280] },
    M109: { affects: ["temperature.nozzle.target"], notes: "Wait for temperature" },
    M140: { affects: ["temperature.bed.target"], range: [0, 120] },
    M190: { affects: ["temperature.bed.target"], notes: "Wait for temperature" },
    M106: { affects: ["cooling.fanSpeed"], range: [0, 100], notes: "S255 = 100%" },
    M107: { affects: ["cooling.fanSpeed"], value: 0 },
    
    // Homing
    G28: { affects: ["status.isHomed"], value: true, notes: "Home all or specified axes" },
    
    // Print control
    M0: { affects: ["status.isPaused"], value: true, notes: "Pause" },
    M1: { affects: ["status.isPaused"], value: true, notes: "Pause with message" },
    M108: { affects: ["status.isPaused"], value: false, notes: "Resume" },
    
    // Units
    G20: { affects: ["modes.units"], value: "inches" },
    G21: { affects: ["modes.units"], value: "millimeters" },
  });