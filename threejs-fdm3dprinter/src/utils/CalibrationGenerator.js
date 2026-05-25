/**
 * Utility to generate dynamic G-Code for the Hardware Calibration Sequence.
 * Adapts to the active printer's dimensions and current loaded filament settings.
 */

export const generateCalibrationGcode = (activePrinter, selectedTests) => {
  let gcode = [];
  
  // Basic preamble
  gcode.push("; --- HARDWARE CALIBRATION SEQUENCE START ---");
  gcode.push("; Printer: " + (activePrinter?.name || "Unknown Asset"));
  gcode.push("G90 ; Use Absolute Positioning");
  gcode.push("M82 ; Use Absolute Extrusion");

  // Determine printer parameters (use defaults if unavailable)
  // Our system tracks htemp like "210 °C" or "210"
  const getTemp = (tempStr) => {
    if (!tempStr) return 200;
    const match = String(tempStr).match(/(\d+)/);
    return match ? parseInt(match[1]) : 200;
  };

  const targetNozzleTemp = getTemp(activePrinter?.htemp || activePrinter?.htempTarget);
  const targetBedTemp = getTemp(activePrinter?.btemp || activePrinter?.btempTarget || 60);

  // We assume a standard 220x220 bed if bedSize is not tracked in the current activePrinter schema
  const bedX = 220;
  const bedY = 220;
  
  // 1. THERMAL TEST
  if (selectedTests.thermal) {
    gcode.push("");
    gcode.push("; --- THERMAL STABILITY (PID) ---");
    gcode.push(`M140 S${targetBedTemp} ; Start heating bed`);
    gcode.push(`M104 S${targetNozzleTemp} ; Start heating nozzle`);
    gcode.push(`M190 S${targetBedTemp} ; Wait for bed temp`);
    gcode.push(`M109 S${targetNozzleTemp} ; Wait for nozzle temp`);
    // Simulated PID tuning sequence
    gcode.push(`M303 E0 S${targetNozzleTemp} C3 ; Auto-tune hotend`);
    gcode.push(`M303 E-1 S${targetBedTemp} C3 ; Auto-tune bed`);
  }

  // 2. EXTRUSION TEST (E-Steps)
  if (selectedTests.extrusion) {
    gcode.push("");
    gcode.push("; --- EXTRUSION TEST (E-Steps) ---");
    if (!selectedTests.thermal) {
       gcode.push(`M109 S${targetNozzleTemp} ; Ensure nozzle is hot for extrusion`);
    }
    gcode.push("G28 ; Home all axes");
    gcode.push("G1 Z50 F1200 ; Raise Z to 50mm to clear bed");
    gcode.push("G92 E0 ; Reset extruder position");
    // Extrude 100mm slowly to test E-steps calibration
    gcode.push("G1 E100 F150 ; Extrude 100mm of filament");
    gcode.push("G92 E0 ; Reset extruder position");
    gcode.push("G1 E-5 F300 ; Quick retract to prevent oozing");
  }

  // 3. MOVEMENT TEST (X/Y/Z Squaring)
  if (selectedTests.movement) {
    gcode.push("");
    gcode.push("; --- MOVEMENT TEST (Squaring) ---");
    if (!selectedTests.extrusion) {
        gcode.push("G28 ; Home all axes");
    }
    gcode.push("G1 Z10 F1200 ; Move Z to safe travel height");
    
    // Rapid travel to 4 corners to test kinematics/belts
    gcode.push(`G1 X0 Y0 F4000 ; Front Left`);
    gcode.push(`G1 X${bedX} Y0 F4000 ; Front Right`);
    gcode.push(`G1 X${bedX} Y${bedY} F4000 ; Back Right`);
    gcode.push(`G1 X0 Y${bedY} F4000 ; Back Left`);
    
    // Center point
    const centerX = bedX / 2;
    const centerY = bedY / 2;
    gcode.push(`G1 X${centerX} Y${centerY} Z0.2 F4000 ; Center, drop Z to check tramming`);
    gcode.push("G1 Z10 F1200 ; Raise Z back up");
  }

  gcode.push("");
  gcode.push("; --- HARDWARE CALIBRATION SEQUENCE COMPLETE ---");
  if (selectedTests.thermal || selectedTests.extrusion) {
      gcode.push("M104 S0 ; Turn off hotend");
      gcode.push("M140 S0 ; Turn off bed");
  }
  gcode.push("G28 X Y ; Home X and Y");
  gcode.push("M84 ; Disable steppers");

  return gcode.join("\n");
};
