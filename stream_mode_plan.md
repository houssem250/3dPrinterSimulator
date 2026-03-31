# Stream Mode Architecture Plan

To transform the simulator into a real-time **Digital Twin**, we must move from a "Push-Pull" model (where the simulator drives the motion) to a "Reactive" model (where the simulator reflects external data).

---

## Phase 1: Core Abstraction
*Current issue: [PrintingMotion](file:///r:/NTIC/M2/PFE/supervisor%20progress/1.1%20State-of-the-art%20review/1.11%20freestyle%20simulation%20coding/threejs-fdm3dprinter/printer_manager/motion/printing_motion.js#62-732) is built around an internal loop that iterates through a pre-loaded G-code list.*

### [MODIFY] [PrintingMotion.js](file:///r:/NTIC/M2/PFE/supervisor%20progress/1.1%20State-of-the-art%20review/1.11%20freestyle%20simulation%20coding/threejs-fdm3dprinter/printer_manager/motion/printing_motion.js)
- Extract the "Physical Motion" logic (snapping axes, triggering filament) into a standalone method like `handleExternalUpdate(state)`.
- Decouple the `moves` array from the axis control logic.

---

## Phase 2: The Communication Layer [NEW]
*We need a bridge between the network and the 3D scene.*

### [NEW] `StreamClient.js`
- Responsibilities:
    - Establish connection (WebSockets / MQTT).
    - Parse protocol-specific messages (e.g., OctoPrint's `Z_HEIGHT`, `POS`).
    - Normalize the data into a standard "PrinterState" object.
    - Emit events that the `PrinterController` can listen to.

---

## Phase 3: Synchronization & Jitter Handling
*Network data is often "jumpy" or delayed.*

### Implementation Details:
- **Lerp (Linear Interpolation):** Instead of snapping the nozzle instantly to a new position, the simulator should smoothly "catch up" over a few milliseconds to avoid visual flickering.
- **Buffer Management:** A small 50ms-100ms buffer to handle network latency spikes.

---

## Phase 4: Intelligence Unit (Bridge)
*The coordination layer discussed earlier.*

### Responsibilities:
- Receive data from **both** [PrintingMotion](file:///r:/NTIC/M2/PFE/supervisor%20progress/1.1%20State-of-the-art%20review/1.11%20freestyle%20simulation%20coding/threejs-fdm3dprinter/printer_manager/motion/printing_motion.js#62-732) (Predicted) and `StreamClient` (Actual).
- Calculate the `error_delta`.
- Update the **Heat Map** (Dynamic Material colors for Bed/Nozzle).

---

## Verification Plan
1. **Mock Data Test:** Create a script that "mimics" a live printer by sending X/Y/Z updates via a local WebSocket.
2. **OctoPrint Integration:** Connect to a real (or virtual) OctoPrint instance.
3. **Latency Stress Test:** Simulate network delays to ensure the nozzle doesn't "break" the filament rendering.
