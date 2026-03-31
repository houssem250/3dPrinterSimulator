# Complete Refactoring Blueprint (Stream + Standalone Ready)

This `new_architecture` folder contains the full skeleton of how the project should be structured to support both offline printing and real-time streaming (Digital Twin).

## Structure Overview

### 📂 `src/core/`
- **`PrinterState.js`**: The central "Digital Twin" store. Every component (Scene, UI, Logic) reads from here.
- **`SimulationEngine.js`**: The orchestrator. It listens to the `PrinterState` and tells the 3D axes where to move.

### 📂 `src/providers/`
- **`BaseProvider.js`**: Universal interface for data.
- **`StandaloneProvider.js`**: The "Offline" runner. It parses G-code files and feeds the `PrinterState`.
- **`StreamProvider.js`**: The "Live" runner. It connects to MQTT/WebSockets and feeds the `PrinterState` in real-time.

### 📂 `src/visuals/`
- **`SceneManager.js`**: Handles the Three.js setup and model loading (previously in `scene_setup.js` and `main.js`).
- **`FilamentRenderer.js`**: Specialized logic for 3D extrusion paths.

### 📂 `src/motion/`
- **`BaseAxis.js`**: Logic for X, Y, and Z physical movement.
- **`Kinematics.js`**: The math bridge between G-code (mm) and the 3D Model's internal coordinate system.

### 📂 `src/utils/` & `src/constants/`
- **`GCodeParser.js`**: Clean regex-based parser.
- **`PrinterConfig.js`**: Centralized settings for bed size, speeds, and colors.

---

## Why this works?
By separating the **Provider** (where data comes from) from the **Engine** (how it's visualized), you can switch between "Offline" and "Live" modes by simply swapping one class, without ever breaking your 3D scene or axis logic.
