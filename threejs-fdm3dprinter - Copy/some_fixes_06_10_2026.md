# Implementation Plan: Ground Testing Fixes

Six issues were identified after ground testing. Below is the root-cause analysis and precise proposed fix for each.

---

## Issue 1 — Thermal Runaway fires during heatup

**Root Cause:** `checkThermalUnderheating()` in `MaintenanceEngine.js` checks `if (minDelta < -10)` using a 20-second window. This is triggered trivially during the warmup phase when the nozzle climbs from room temp (20°C) to target (200°C). The delta is `-180°C` at the start — nowhere near stable.

**Fix:** Add a "stability gate". The check should only arm once the nozzle has reached within 5°C of the target at least once in the current session. This is achieved via a per-printer state variable `nozzleEverReachedTarget` in the engine. Until `nozzleActual >= nozzleTarget - 5` has been observed at least once, the underheating check is skipped entirely.

**Files:**
- `src/core/MaintenanceEngine.js` — Add `this.printerState = {}` map in constructor. In `checkThermalUnderheating()`, check and set `this.printerState[printer.id].heatedUp`.

---

## Issue 2 — Heat creep correctly detected but did NOT pause the printer

**Root Cause:** `executeEmergencyAction()` currently only updates the Zustand store state (a UI-only operation). It does **not** call OctoPrint. The active printer's `connectionConfig` (`ip` + `apiKey`) is available in `printers[id]` in the store — it just isn't being read.

**Fix:** Import `OctoPrintControlService` dynamically inside `executeEmergencyAction()`. Read `useFleetStore.getState().printers[printerId]?.connectionConfig`. If it exists (i.e., an OctoPrint connection was established), call `OctoPrintControlService.issueJobCommand(ip, apiKey, 'pause')`. If not connected, fall back to the current UI-state-only approach.

**Files:**
- `src/core/MaintenanceEngine.js` — Update `executeEmergencyAction()` to call OctoPrint.

---

## Issue 3 — Low flow false alerts after print finished or paused

Two sub-issues:

**3a — Fires after print is done:** The `evaluatePrinter()` guard is `if (!printer.isPrinting) return`. However, after print finishes, OctoPrint MQTT sometimes sends a final frame with `feedrate > 0` before the state is fully settled, and `isPrinting` can still be `true` transiently.

**Fix 3a:** Tighten the guard — additionally check that `printer.status?.state === 'PRINTING'`. If the state is `PRINTDONE`, `PRINTCANCELLED`, or `PAUSED`, skip all checks.

**3b — 10-second window too short, false positives during travel moves:** Long travel moves (no extrusion) can exceed 10 seconds on large prints.

**Fix 3b:** Increase the clog detection window from `10s` to `30s`. Also add a minimum threshold: `feedrate` must be above `~2 mm/s` (not just `> 0`) to be considered an "active extrusion move", filtering out extremely slow travel or deceleration artifacts.

**Files:**
- `src/core/MaintenanceEngine.js` — Update `evaluatePrinter()` guard and `checkClog()` window + feedrate threshold.

---

## Issue 4 — Health Rail still not scrollable

**Root Cause:** The CSS investigation reveals that the authoritative `.right-rail` definition (lines 1729–1735) in `style.css` uses `overflow: visible` (inherited from the combined `.left-sidebar, .right-rail` block at line 1717). Our previous fix added `overflow-y: auto` to an earlier `.right-rail` block around line 252, but this is overridden by the later, more specific block at line 1729 which inherits `overflow: visible` from line 1717.

**Fix:** In the block at line 1717 (`.left-sidebar, .right-rail`), change `overflow: visible` to `overflow: hidden` (to contain children). Then in the specific `.right-rail` block at line 1729, add `overflow-y: auto; min-height: 0;`. The `.left-sidebar` inner `.fleet-manager` already has `overflow-y: auto` from our earlier fix. 

> [!IMPORTANT]
> The inner content of `.right-rail` is a flex column. For `overflow-y: auto` to work on an absolutely-positioned flex container, you must also ensure `height` is constrained. Since it already has `top: 40px; bottom: 0;` this is sufficient — `overflow-y: auto` just needs to be on the right element.

**Files:**
- `style.css` — Line 1717: change `overflow: visible` to `overflow: hidden`. Line 1729–1735 block: add `overflow-y: auto; min-height: 0; gap: 10px; padding: 10px;`.

---

## Issue 5 — Chart improvements

### 5a — Temp graph not displaying live values like other charts

**Root Cause:** In `ThermalChart.jsx`, the live value badges (`valNozzleRef`, `valBedRef`, `valHeatsinkRef`) are only updated via the cursor `setCursor` callback when the user **hovers** over the chart. For other charts (VibrationChart), there's fallback logic that reads the **last data point** to display the live reading even without hover interaction. `ThermalChart` is missing this fallback.

**Fix:** Inside the `buildData` / data push `useEffect`, after calling `chartRef.current.setData(...)`, read the last value from `history` and update the three `valRef.current.textContent` DOM nodes directly. This makes the badges "sticky" at the latest reading.

**Files:**
- `src/components/ui/ThermalChart.jsx` — Add live value update inside the `history` `useEffect`.

### 5b — Use rule-based alert values for color shift

**Rule thresholds to drive color:**
- **Nozzle:** Normal (green) if within ±5°C of target. Warning (amber) if delta > ±10°C. Critical (red) if delta > ±20°C.
- **Bed:** Same ±5/10/20°C logic.
- **Heatsink:** Green if < 44.7°C, Amber if 44.7–52.1°C, Red if > 52.1°C.

**Fix:** In the `useEffect` that updates live values (after 5a fix), compute the severity level and set `valRef.current.style.color` to the appropriate CSS variable.

**Files:**
- `src/components/ui/ThermalChart.jsx` — Add color logic to the live value `useEffect`.

### 5c — "No data" state for empty graphs

**Fix:** In all three chart components (`ThermalChart`, `VibrationChart`, `FlowChart`), add a conditional overlay div that renders on top of the chart when `history.length === 0`. Style it as a centered, dim text overlay: `"— SENSOR OFFLINE —"` or `"Awaiting MQTT data..."`. It should use `position: absolute; inset: 0; display: flex; align-items: center; justify-content: center`.

**Files:**
- `src/components/ui/ThermalChart.jsx`
- `src/components/ui/VibrationChart.jsx`
- `src/components/ui/FlowChart.jsx`

---

## Issue 6 — Troubleshooting Guide per Alert

**Current state:** `getWizardSteps()` in `HealthRail.jsx` does a simple `title.includes(...)` string match and returns one single generic step.

**Proposed approach:** Replace `getWizardSteps()` with a proper lookup map. Each fault type gets a full multi-step guide including root cause, diagnostic steps, and resolution actions.

**Common Faults to Cover (our current detection stack):**

| Fault | Detection Method | Root Cause | Steps |
|---|---|---|---|
| **Heat Creep** | Heatsink temp slope + absolute | PTFE tube conducts heat upwards, softens filament before the melt zone | 1. Pause print. 2. Increase cooling fan speed. 3. Check heatsink fan for blockage/failure. 4. Check PTFE tube clearance from heatblock. 5. Consider all-metal hotend upgrade. |
| **Thermal Runaway (Underheating)** | Rolling min delta > -10°C for 20s | Heater cartridge failure, loose wires, thermistor slipped out of block | 1. Pause print. 2. Check heater cartridge resistance (nominally 12–16Ω). 3. Check thermistor resistance (100kΩ at room temp for NTC). 4. Tighten grub screws on heater block. 5. Replace heater/thermistor if damaged. |
| **Clog / No Flow** | cumulativeMm unchanged during feedrate | Filament stripped by extruder gear, PTFE tube blockage, nozzle jam | 1. Pause print. 2. Attempt cold pull / atomic pull. 3. Heat nozzle to 250°C and manually push filament. 4. Disassemble and clean nozzle. 5. Check extruder gear for stripping marks. |
| **Loose Belt / Erratic Wobble** | StdDev of acc_z > threshold | X-axis belt tension loss, worn/loose V-rollers, loose stepper pulley | 1. Power off motors. 2. Check X-belt tension (should vibrate like a low guitar string). 3. Tighten belt with tensioner or idler adjustment. 4. Check V-rollers — should have slight resistance. 5. Check stepper pulley grub screw. |

**Implementation:**
- In `HealthRail.jsx`, replace `getWizardSteps()` with a `FAULT_GUIDES` object (keyed by fault name substrings) where each entry is an array of `{ step, description, action }` objects.
- The UI renders each step as a numbered list item with a small `[ACTION]` button if an action is automatable (e.g., fan speed command to OctoPrint).
- The existing `FIX NOW` / `DIAGNOSE` buttons can remain as the final action after the user has followed the steps.

**Files:**
- `src/components/ui/HealthRail.jsx` — Replace `getWizardSteps()` with `FAULT_GUIDES` lookup and multi-step rendering.

---

## Files Modified

| File | Changes |
|---|---|
| `src/core/MaintenanceEngine.js` | Issues 1, 2, 3 |
| `style.css` | Issue 4 |
| `src/components/ui/ThermalChart.jsx` | Issue 5a, 5b, 5c |
| `src/components/ui/VibrationChart.jsx` | Issue 5c |
| `src/components/ui/FlowChart.jsx` | Issue 5c |
| `src/components/ui/HealthRail.jsx` | Issue 6 |
