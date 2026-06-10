# 3D Printer Preventive Maintenance & Vibration Analysis

This document provides an analysis of your vibration graph approach, ideas for implementing time-span-based preventive maintenance rules in real-time, and a review of your supervised learning methodology in `run_model.py`.

## 1. Vibration Graph: Hardware Mapping (IMU X/Z vs. Printer Kinematics)
**Your Hardware Context:** The accelerometer is mounted directly on the nozzle assembly. The sensor's axes map to the physical machine as follows:
*   **IMU X-Axis:** Vertical, parallel to the vertical plane $\rightarrow$ Translates to the **physical Z-axis movement** of the printer (e.g., Z-hop, layer changes, or Z-binding).
*   **IMU Z-Axis:** Horizontal, perpendicular to the nozzle's movement vector $\rightarrow$ Translates to the **side-to-side shaking/wobble** of the assembly while it travels along the physical X-axis.

### Analysis of the Approach
**Why your intuition is spot-on:**
Filtering out the IMU's Y-axis (which likely captures the heavy inertial jolts from the Y-bed slinging back and forth) is a highly effective way to isolate the "health" of the X-gantry and extruder head. 
*   By focusing on **IMU X (Printer Z)**, you can cleanly monitor for Z-rod binding, irregular layer changes, or vertical nozzle crashing.
*   By focusing on **IMU Z (Side-to-side wobble)**, you can monitor the stability of the X-carriage (e.g., loose V-rollers, **loose X-belt**, or violent extrusion vibrations).

---

## 2. Rule-Based Preventive Maintenance (Time-Span Validation)
To eliminate false positives, "decisions can't be made on first contact." We must use **Sliding Windows (Rolling Buffers)**. In `useFleetStore.js`, your `tempHistory`, `vibHistory`, and `flowHistory` arrays serve as these buffers.

Here is the analytical breakdown of how to translate your physical logic into live Javascript rules:

### A. Heatsink Overheating (Heat Creep)
*   **The Metric:** Cold-end temperature (`heatsink` or `temp_c`).
*   **The Rule:** Evaluate across multiple stages using **both absolute maximums and rate-of-change**, mirroring `HC_TEMP_THRESHOLDS`.
*   **Live Implementation Idea:** 
    *   *Stage 1 (Warning):* Temp > 44.7°C **AND** slope > 1.8°C/min over the last 30 seconds.
    *   *Stage 2 (Critical):* Temp > 52.1°C **AND** slope > 3.2°C/min.
    *   *Stage 3 (Failure):* Temp > 61.3°C (Absolute failure point, regardless of slope).

### B. Nozzle Thermal Runaway (Underheating)
*   **The Metric:** `nozzleTarget - nozzleActual`.
*   **The Rule:** A test to see if the nozzle can hold its set temperature over time without getting too cold to melt the filament.
*   **Live Implementation Idea:** Use a **rolling minimum** of the delta. If the difference between target and actual drops below a critical threshold (e.g., -10°C to -15°C) and *fails to recover* within a 15 to 20-second rolling window, it indicates the heater cartridge is failing or a massive clog is acting as a heat sink. 

### C. No Filament Flow with Live Feedrate
*   **The Metric:** Extruder flow (`cumulativeFlowMm` or `e`) vs. G-code Feedrate (`f`).
*   **The Rule:** Check `flowHistory` over the last 10 seconds. If `feedrate > 0` but `ΔcumulativeFlowMm == 0` for the entire 10-second window, you have a confirmed clog, a stripped gear, or a filament runout. 

### D. Erratic Vibrations (Wobble & Loose Belts)
*   **The Metric:** Standard Deviation of IMU X (Vertical) and IMU Z (Wobble).
*   **The Rule:** Calculate the standard deviation over a 50-sample window. If the standard deviation of IMU Z sits above the 85th percentile of your baseline (established during the first few layers) for more than 5 seconds, it heavily indicates a **loose drive belt** or worn V-rollers.

---

## 3. Alert Handling & UI Notification Feed (Health Rail)

When the maintenance engine detects any of the anomalies defined above, it must correctly interface with the user via the right-side Health Rail in the UI.

### Three-Tier Alert System Strategy

Your system should dispatch alerts into the `systemAlerts` array in `useFleetStore.js` with one of three severity levels. Each level dictates how the UI and the physical printer react.

1.  **Info (`type: 'info'`)**
    *   **Trigger:** Routine events, auto-leveling completion, or minor temperature fluctuations that recover quickly.
    *   **UI Behavior:** Appears silently in the Health Rail feed with a blue border.
    *   **Machine Action:** None.

2.  **Warning (`type: 'warning'`)**
    *   **Trigger:** Early onset of issues that require attention but haven't broken the print yet. Examples: *Stage 1 Heat Creep (temp slowly rising)*, *Minor Z-Wobble detected*, or *Partial clog suspected*.
    *   **UI Behavior:** Appears in the Health Rail with an amber/yellow border. The accordion can be manually expanded by the user to view diagnostics and click "Acknowledge".
    *   **Machine Action:** No automatic interruption, but logs the event to the timeline so the operator knows when quality started to degrade.

3.  **Critical (`type: 'critical'`)**
    *   **Trigger:** Catastrophic or guaranteed failures. Examples: *Stage 3 Heat Creep (> 61.3°C)*, *Confirmed Clog (No Flow for 10s)*, or *Severe Belt Slippage*.
    *   **UI Behavior:** Appears at the top of the Health Rail with a red border. The accordion should auto-expand (`isExpanded: true`) to immediately show the "Fix Wizard" or emergency details. The UI flashes to demand operator attention.
    *   **Machine Action (Autonomous Intervention):** The `useFleetStore` listener intercepts the critical alert and automatically pushes an emergency command to the printer via MQTT.
        *   **Pause (`M600` / `M25`):** For clogs or filament runouts, allowing the user to swap filament and resume without losing the print.
        *   **Abort/Kill (`M112`):** For thermal runaway (underheating) or critical heat creep where continuing or pausing leaves a fire hazard active.

---

## 4. Codebase Coupling Assessment

**Verdict: Exceptional Synergy**

Implementing this preventive maintenance engine into your existing React codebase will be incredibly low-friction. You have already laid the perfect architectural foundation. Here is why:

1.  **The Buffers Already Exist:** In `useFleetStore.js`, the `updatePrinter` and `updateSensorHistory` methods are already aggregating telemetry into `tempHistory`, `vibHistory`, and `flowHistory`. You don't need to build any new data pipelines. The 30-second and 10-minute sliding windows you require are literally already sitting in memory.
2.  **Stateless Rules Engine:** Because `useFleetStore.getState()` exposes everything globally, you can create a pure Vanilla Javascript file (e.g., `src/core/MaintenanceEngine.js`). It doesn't need to be tangled in React component lifecycles. It can just run a simple `setInterval(evaluatePrinters, 1000)`, iterate over `getState().printers`, and crunch the math on the history arrays.
3.  **Unified Alert Pipeline:** You already have the `systemAlerts` array and the `addTimelineEvent` methods. If `MaintenanceEngine.js` detects an anomaly, it simply calls `useFleetStore.getState().toggleAlert({ type: 'critical', title: 'Clog Detected', ... })`. The UI will magically render it without any extra wiring.
4.  **MQTT Orchestration:** For autonomous aborts/pauses, the engine can simply emit the respective MQTT command payload via your existing Mosquitto topic structure (`printer/control/pause`), perfectly completing the loop.

Because you chose Zustand and separated your MQTT logic from your React views, building this "AI/Rule Engine" layer is essentially just writing mathematical formulas against arrays that are already exactly where they need to be.
