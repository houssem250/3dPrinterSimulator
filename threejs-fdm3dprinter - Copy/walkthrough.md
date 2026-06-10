# Walkthrough: Preventive Maintenance Engine Implementation

The standalone background rules engine has been successfully implemented and integrated into the React application!

## What Was Accomplished
1. **Removed Dummy Alerts & Prepared the Store**
   - The hardcoded dummy alerts in `useFleetStore.js` were cleared out so the system starts with a clean slate.
   - Added a new `addSystemAlert` action. Crucially, this function includes **deduplication logic**: it checks if an alert with the same title is already active, preventing the UI from being spammed by the engine every 1000ms.

2. **Created the `MaintenanceEngine` Core**
   - A new file `src/core/MaintenanceEngine.js` was created. It is entirely decoupled from React components.
   - It runs a `setInterval` loop every 1 second, reading `getState().printers` directly.
   - **Physics-Aware Rules Added:**
     - **Heat Creep:** Looks at the last 30s of `tempHistory`. Triggers Warning at >44.7°C, Critical at >52.1°C, and Failure at >61.3°C.
     - **Thermal Underheating:** Looks at the last 20s of `tempHistory`. If the rolling minimum of `actual - target` is worse than -10°C, it triggers a Critical alert.
     - **Clog / No Flow:** Checks the last 10s of `flowHistory`. If `feedrate > 0` but `cumulativeFlowMm` hasn't changed, it triggers a Critical alert.
     - **Vibration Wobble:** Analyzes the last 50 samples of `vibHistory`. If the standard deviation of `acc_z` exceeds 300 LSB, it triggers a Warning.

3. **Autonomous Actions**
   - When the engine detects a Critical issue (like severe heat creep or a clog), it calls the `executeEmergencyAction` function.
   - Currently, this method updates the active job state (`updateActiveJob`) to emulate a "Pause" or "Abort". In a fully physical deployment, this function can easily be swapped to publish `M600` or `M112` commands to the MQTT broker.

4. **Engine Initialization**
   - In `src/App.jsx`, the engine is imported and `.start()` is called within the root `useEffect` on component mount. The engine cleans up and stops itself when the app unmounts.

## How to Test It
Because the engine is fully hooked up to your MQTT stream pipeline:
1. Start your local dev server.
2. Run your existing replay script on one of the faulty databases: 
   `python mqtt_replay.py` (ensure it's pointing to `telemetry_temp_err(heat_creep)_flattened.db`).
3. Watch the Health Rail in your UI! As the telemetry streams in and the rolling windows fill up, you should see the `HEAT CREEP WARNING` automatically appear in amber, followed by the `SEVERE HEAT CREEP` auto-expanding in red, which will concurrently pause the print job.
