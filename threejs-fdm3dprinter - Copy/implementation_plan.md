# Implementation Plan: Preventive Maintenance Engine

This plan outlines the steps to build and integrate the standalone `MaintenanceEngine` into the React/Zustand architecture. 

## User Review Required

Please review the proposed thresholds in the `MaintenanceEngine` logic below. They are ported from your `run_model.py`, but let me know if you want them adjusted for the live environment.

## Proposed Changes

### 1. State Management
#### [MODIFY] [useFleetStore.js](file:///i:/mouadh/studies/m2/S2/frontjs/his_front/threejs-fdm3dprinter/src/store/useFleetStore.js)
- **Add `addSystemAlert` Action:** Create a function to push new alerts into the `systemAlerts` array with a unique ID and current timestamp.
- **Deduplication:** Ensure `addSystemAlert` doesn't spam the exact same active alert repeatedly. We'll track active alert signatures.
- **Empty Default State:** Clear out the dummy alerts in `systemAlerts` so the list starts clean.

---

### 2. Core Logic
#### [NEW] [MaintenanceEngine.js](file:///i:/mouadh/studies/m2/S2/frontjs/his_front/threejs-fdm3dprinter/src/core/MaintenanceEngine.js)
Create a new file containing a standalone javascript module:
- Contains a `setInterval` loop (running every 1000ms).
- Reads `useFleetStore.getState().printers`.
- Iterates over each printer and checks:
  1. **Heat Creep:** Looks at `tempHistory` (last 30s). Calculates slope.
     - Warning: > 44.7°C AND > 1.8°C/min
     - Critical: > 52.1°C AND > 3.2°C/min
     - Critical: > 61.3°C
  2. **Thermal Underheating:** Looks at `tempHistory` (last 20s). If `target - actual < -10°C` persistently, trigger Critical.
  3. **No Flow / Clog:** Looks at `flowHistory` (last 10s). If `feedrate > 0` but `cumulativeFlowMm` hasn't changed, trigger Critical.
  4. **Z-Wobble / Loose Belt:** Looks at `vibHistory` (last 50 samples). If std of `acc_z` > 300 LSB (threshold TBD), trigger Warning.
- Dispatches alerts via `useFleetStore.getState().addSystemAlert(...)`.
- For Critical alerts, invokes `useFleetStore.getState().setPrintCommand('pause')` (or emits MQTT).

---

### 3. Engine Initialization
#### [MODIFY] [FarmSystem.js](file:///i:/mouadh/studies/m2/S2/frontjs/his_front/threejs-fdm3dprinter/src/core/FarmSystem.js) (or `App.jsx`)
- Import `MaintenanceEngine.js`.
- Call a `.start()` function when the application boots up.

## Verification Plan
1. Start the simulation.
2. Replay a faulty database using your `mqtt_replay.py` (e.g., `telemetry_temp_err(heat_creep)_flattened.db`).
3. Verify that the Health Rail in the UI successfully generates a Warning alert, followed by a Critical alert as the heat creep progresses.
4. Verify that the engine correctly issues a "pause" command when the critical threshold is reached.
