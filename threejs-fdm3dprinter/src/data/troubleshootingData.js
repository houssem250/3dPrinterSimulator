export const TROUBLESHOOTING_DATA = {
    extrusion: {
        title: "EXTRUSION FAULT RESOLUTION PATH",
        steps: [
            "Check for physical nozzle clogging or composite material crystal build-up.",
            "Verify tensioning arm on filament extruder gears is not slipping.",
            "Measure hotend diameter entry using physical calipers to adjust volumetric flow multiplier."
        ]
    },
    movement: {
        title: "STRUCTURAL GEOMETRY RESOLUTION PATH",
        steps: [
            "Inspect mechanical drive X/Y axis belts for slack or missing teeth.",
            "Manually align dual lead-screw columns to correct Z-axis gantry sagging.",
            "Tighten eccentric v-slot guide wheels to remove frame play and coordinate backlash."
        ]
    },
    thermal: {
        title: "THERMAL STABILITY RESOLUTION PATH",
        steps: [
            "Verify thermistor wiring harness component is securely seated in heater block.",
            "Confirm silicone heat-block protection sock insulation shield is present.",
            "Run a full manual command-line PID autotune routine via terminal console."
        ]
    }
};
