# Stream Mode Skeleton - Implementation Guide

## Overview
This directory contains skeleton classes for **Stream Mode** (Digital Twin architecture), which receives real-time printer state from external sources (MQTT, OctoPrint) and mirrors them in the 3D scene.

## File Structure

### 1. `mqtt_config.js` - Configuration
**Responsibility:** Manages MQTT connection configuration.

**Key Methods:**
- `getConnectionOptions()` : Returns formatted connection options for MQTT client
- `getTopics()` : Returns list of topics to subscribe to

**TODO:** Complete connection configuration based on your MQTT broker setup.

---

### 2. `mqtt_subscriber.js` - MQTT Communication
**Responsibility:** Handles connection to MQTT broker and message parsing.

**Key Methods:**
- `connect()` : Establish connection to MQTT broker
- `subscribe()` : Subscribe to configured topics
- `disconnect()` : Close connection
- `on(event, callback)` : Register event listeners
- `_normalizeState(topic, data)` : Convert protocol-specific messages to standard state format

**Events Emitted:**
- `stateUpdate` : New printer state received
- `error` : Connection/parsing error
- `connected` : Successfully connected
- `disconnected` : Connection closed

**Expected Normalized State Format:**
```javascript
{
  timestamp: '2024-04-01T15:20:01Z',
  position: { x: 150.0, y: 100.5, z: 0.2, e: 1450.2 },
  temperature: { nozzle: 215, bed: 60 },
  status: { is_printing: true, is_extruding: true, fan_speed: 100 }
}
```

**TODO:**
- Implement actual MQTT client connection using `mqtt.js` library
- Parse protocol-specific messages from your printer/OctoPrint setup

---

### 3. `stream_state_provider.js` - External State Bridge
**Responsibility:** Access printer state from the main PrinterController to ensure stream mode doesn't conflict with standalone mode.

**Key Methods:**
- `isPrinterInProcess()` : Check if printer is running standalone mode
- `canStreamPrinterState()` : Check if safe to stream (inverse of above)
- `getPrinterState()` : Get complete printer state summary
- `getAxisPosition(axisName)` : Get specific axis position

**Critical Function:** Prevents stream updates when printer is executing examples/standalone jobs.

**TODO:**
- Implement state checks based on your PrinterController API
- Determine how to detect: `isRunning`, `is_extruding`, current mode

---

### 4. `stream_simulator.js` - Stream Update Handler
**Responsibility:** Receives MQTT state updates and applies them to the 3D scene, BUT only if printer is in reset/idle mode.

**Key Methods:**
- `start()` : Initialize stream simulator (blocks if printer in process)
- `stop()` : Shut down stream simulator
- `_applyPositionUpdate(position)` : Update axis positions (X, Y, Z, E)
- `_applyTemperatureUpdate(temperature)` : Update visual heat map
- `_applyExtrusionUpdate(eValue, isExtruding)` : Append filament when extruding

**Safety Mechanisms:**
- Validates printer is NOT in process before applying updates
- Stops accepting updates if printer mode switches
- Emits alerts via `StreamAlerts` on conflicts

**TODO:**
- Implement axis position application with smooth interpolation
- Implement temperature-based visual feedback
- Implement filament rendering for stream mode

---

### 5. `stream_alerts.js` - User Notifications
**Responsibility:** Alert system to inform users of stream mode status and mode conflicts.

**Key Methods:**
- `createAlert(type, title, message, options)` : Create custom alert
- `alertPrinterInProcess()` : Alert when printer can't start stream mode
- `alertStreamModeActive()` : Notify stream mode enabled
- `alertModeConflict()` : Critical alert on mode conflict
- `alertMQTTConnected/Disconnected()` : Connection status
- `onAlert(callback)` : Subscribe to alerts
- `getRecentAlerts()` : Retrieve alert history

**Alert Types:**
- `'info'` : General information
- `'warning'` : Operation warning
- `'error'` : Connection/parse errors
- `'critical'` : Mode conflicts, must-see alerts

**TODO:**
- Integrate with UI to display alerts to user
- Connect alerts to stream simulator error handlers

---

### 6. `index.js` - Module Exports
**Responsibility:** Central export point for stream mode components.

**Usage Pattern:**
```javascript
import {
  MQTTConfig,
  MQTTSubscriber,
  StreamStateProvider,
  StreamSimulator,
  StreamAlerts
} from './stream/index.js';
```

---

## Implementation Roadmap

### Phase 1: Core Skeletons ✅ (Current)
- Create class structure
- Define public interfaces
- Document expected data formats
- Mark TODOs for each component

### Phase 2: MQTT Integration (Next)
- Implement `mqtt_subscriber.js` with actual mqtt.js library
- Create message normalization based on your protocol
- Test MQTT connection and message flow

### Phase 3: State Provider Integration
- Implement `stream_state_provider.js` by examining PrinterController API
- Determine correct methods to check printer state
- Create unit tests for state checking logic

### Phase 4: Simulator Implementation
- Implement axis position updates with interpolation
- Add temperature visualization logic
- Connect filament rendering for stream mode

### Phase 5: UI Integration
- Connect StreamAlerts to your UI display system
- Create visual indicators for active mode
- Add stream mode toggle controls

---

## Key Design Principles

> **Separation of Concerns:** Stream mode operates independently from standalone mode. The outside folder (standalone) remains completely unchanged.

> **Safety First:** Stream mode validates printer state before applying any updates. If conflict detected, alerts user immediately.

> **Progressive Enhancement:** Start with skeletons, test each component, then implement production logic.

> **External State Access:** Stream mode only reads printer state from outside, never modifies standalone components directly.

---

## Testing Checklist

- [ ] MQTT subscriber connects/disconnects properly
- [ ] Message normalization correctly formats all protocols
- [ ] State provider correctly detects printer in/out of process
- [ ] Stream simulator blocks start if printer busy
- [ ] Alerts properly notify on all conflict scenarios
- [ ] Position updates apply smoothly without jumping
- [ ] Filament renders only during actual extrusion
- [ ] Mode switching is seamless with proper alerts

---

## Integration Touchpoints

The stream folder interfaces with:
1. **PrinterController** (main printer controller) - to check state
2. **MQTT Broker** (external) - to receive state updates
3. **UI/Display** (to show alerts) - feedback to user
4. **Three.js Scene** (indirectly via axis/renderer) - to update visualization

---

## Notes

- Keep outside stream folder unchanged during alpha - focus on making stream mode work first
- Future refactoring can optimize and integrate code (Phase 2+)
- Each class uses JSDoc format for IDE support and documentation
- All TODOs are explicit - search for "TODO:" to find implementation points
