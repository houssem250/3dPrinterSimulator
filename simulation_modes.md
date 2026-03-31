# 3D Printer Simulation Modes: Refined Definitions

This document outlines the two primary operational modes for the 3D printer simulator, providing clear terminology and architectural roles for each.

---

## 1. Standalone Mode (Local/Offline)
**Definition:** The simulator acts as the *primary driver*. It processes input data (G-code or trajectory arrays) and manages the execution timeline independently.

### Key Characteristics:
- **Data Source:** Local `.gcode` files, JSON paths, or internal scripts.
- **Timeline Management:** The [PrintingMotion](file:///r:/NTIC/M2/PFE/supervisor%20progress/1.1%20State-of-the-art%20review/1.11%20freestyle%20simulation%20coding/threejs-fdm3dprinter/printer_manager/motion/printing_motion.js#62-732) class controls the `requestAnimationFrame` loop or `setTimeout` delays.
- **Speed Control:** Supports `speedMultiplier` (e.g., 2× or 10× speed) because it doesn't need to sync with the real world.
- **Primary Use Case:** 
    - G-code verification before real printing.
    - Pathfinding and algorithmic testing.
    - Creating "perfect" visualizations for presentations/media.

---

## 2. Digital Twin Mode (Streaming/Live Sync)
**Definition:** The simulator acts as a *reactive mirror*. It receives real-time state updates from an external source (Physical Printer, OctoPrint, or MQTT broker) and updates its 3D state to match.

### Key Characteristics:
- **Data Source:** Real-time stream (WebSockets, MQTT, or HTTP polling).
- **Control Source:** External (the firmware or middleware dictates the position).
- **Timing:** Strictly 1:1 real-time. The simulator "follows" rather than "leads".
- **Primary Use Case:**
    - Remote monitoring of a long print job.
    - Immersive dashboard for "Smart Factory" environments.
    - Debugging physical hardware issues via visual mapping.

---

## Technical Comparison

| Feature | Standalone (Offline) | Digital Twin (Stream) |
| :--- | :--- | :--- |
| **Active Controller** | `PrintingMotion.js` | Middleware (OctoPrint/MQTT) |
| **Position Strategy** | Interpolated (G-code path) | Snap-to-Point (Incoming XYZE) |
| **Filament Rendering** | Cumulative (rebuilds mesh) | Real-time Append (stream-based) |
| **State Source** | Local Buffer | Remote JSON Payload |

---

## 3. The "Intelligence Unit" (Analytics & Sync)
**Definition:** A high-level supervisory layer that monitors both modes simultaneously to provide insights, safety checks, and enhanced visualization.

### Key Capabilities:
- **Comparison Engine:** Compares the *Expected Path* (Standalone) with the *Actual Path* (Stream). If the deviation is too high, it can trigger an alert.
- **Dynamic Visualization:** Updates visual properties based on real-time data:
    - **Heat Mapping:** Changing the bed/nozzle color based on reported temperatures.
    - **Physical Feedback:** Simulating vibrations or motion delays.
- **Predictive Maintenance:** Detecting "Filament Runout" or "Nozzle Clog" by analyzing the delta between commanded moves and reported sensor data.
- **Machine State Logic:** Manages the high-level state machine (Idle → Heating → Printing → Success/Failure).

### Future Vision:
This unit acts as the "Brain" of the simulator, turning it from a simple visualizer into a diagnostic tool.

---

## Proposed Architecture for "Stream Mode"

To implement this, we would introduce a **`StreamClient`** that:
1. Connects to the data source (e.g., `mqtt.js` or `OctoPrint Client`).
2. Listens for `POSITION_UPDATE` events.
3. Directly calls `xAxis.setPosition()`, `yAxis.setPosition()`, etc.
4. Alerts the [FilamentRenderer](file:///r:/NTIC/M2/PFE/supervisor%20progress/1.1%20State-of-the-art%20review/1.11%20freestyle%20simulation%20coding/threejs-fdm3dprinter/printer_manager/motion/printing_motion.js#537-547) to `appendPoint()` only when `is_extruding` is true in the payload.

### Example Payload Structure:
```json
{
  "timestamp": "2024-03-31T14:20:01Z",
  "p": { "x": 150.0, "y": 100.5, "z": 0.2, "e": 1450.2 },
  "t": { "nozzle": 215, "bed": 60 },
  "s": { "is_printing": true, "fan": 100 }
}
```
