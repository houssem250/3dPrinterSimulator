/**
 * @file STREAM_MODE_GUIDE.md
 * @description Complete guide to Stream Mode configuration and usage
 */

# Stream Mode Guide

Stream mode allows the 3D simulator to receive real-time printer state updates from an external MQTT broker and reflect them in real-time 3D visualization.

---

## Quick Start

### 1. Start Stream Mode (Browser Console)

```javascript
// Start listening to MQTT broker
await app.stream.start()

// Check if stream mode is active
app.stream.isActive()

// Stop stream mode
await app.stream.stop()
```

**Note:** If MQTT library is not available in browser, the system will use mock mode for testing with debug publisher.

### 2. Listen for Alerts

```javascript
// Subscribe to all alerts
app.stream.getAlerts().onAlert(alert => {
  console.log(`[${alert.type}] ${alert.message}`)
})
```

---

## Configuration

Stream mode uses **environment variables** to configure the MQTT broker connection.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_MQTT_BROKER` | `localhost` | MQTT broker address |
| `VITE_MQTT_PORT` | `1883` | MQTT broker port |
| `VITE_MQTT_PROTOCOL` | `mqtt` | Protocol: 'mqtt' (TCP) or 'ws' (WebSocket) |
| `VITE_MQTT_USERNAME` | `null` | MQTT broker username (optional) |
| `VITE_MQTT_PASSWORD` | `null` | MQTT broker password (optional) |
| `VITE_MQTT_CLIENT_ID` | Auto-generated | Unique client identifier |
| `VITE_MQTT_TOPIC_STATE` | `octoprint/printer/state` | Topic for printer state |
| `VITE_MQTT_TOPIC_MOVEMENT` | `octoprint/gcode/machine/position` | Topic for position updates |
| `VITE_MQTT_TOPIC_EXTRUSION` | `octoprint/printer/extrusion` | Topic for extrusion events |
| `VITE_MQTT_TOPIC_TEMPERATURE` | `octoprint/printer/temperature` | Topic for temperature updates |
| `VITE_MQTT_TOPIC_MODE` | `simulator/mode` | Topic to publish simulator mode status |

### Setting Environment Variables

#### Option 1: Browser Console (Dev Mode)

Before starting app, set environment variables:

```bash
# In your terminal before loading the app:
export MQTT_URL="mqtt://192.168.1.100:1883"
export MQTT_USERNAME="printer_user"
export MQTT_PASSWORD="secure_password"
```

Then reload the browser.

#### Option 2: In .env File

Create a `.env` file in the project root:

```env
MQTT_URL=mqtt://192.168.1.100:1883
MQTT_CLIENT_ID=fdm-simulator-dev
MQTT_USERNAME=admin
MQTT_PASSWORD=password123
MQTT_TOPIC_STATE=printer/state
MQTT_TOPIC_MOVEMENT=printer/movement/position
MQTT_TOPIC_EXTRUSION=printer/movement/extrusion
```

#### Option 3: Direct Configuration in mqtt_config.js

Edit `stream/mqtt_config.js` to set defaults:

```javascript
export const MQTT_CONFIG = {
  connection: {
    url: 'mqtt://192.168.1.100:1883',
    clientId: 'fdm-simulator-dev',
    username: 'admin',
    password: 'password123',
    // ... rest of config
  },
  topics: {
    printerState: 'printer/state',
    movement: 'printer/movement/position',
    extrusion: 'printer/movement/extrusion',
    // ... rest of topics
  },
};
```

---

## MQTT Broker Setup

### Local MQTT Broker (Mosquitto)

#### Install Mosquitto

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

**macOS (Homebrew):**
```bash
brew install mosquitto
brew services start mosquitto
```

**Windows:**
Download from: https://mosquitto.org/download/

#### Configure Mosquitto (`/etc/mosquitto/mosquitto.conf`)

```conf
# Default listener
listener 1883
protocol mqtt

# WebSocket listener (for browser clients)
listener 9001
protocol websocket

# Allow anonymous connections (for development)
allow_anonymous true

# Optional: set password file
password_file /etc/mosquitto/passwd
```

#### Restart Mosquitto

```bash
sudo systemctl restart mosquitto
```

### Browser Compatibility

**Note:** The MQTT library may not work in all browsers due to Node.js dependencies. If you encounter `mqtt.connect is not a function` errors:

1. The system will automatically fall back to mock mode
2. Use the debug publisher for testing: `app.stream.debugPublisher.simulateLinearMotion()`
3. For production MQTT, consider using a server-side proxy or different MQTT client library

### Remote MQTT Broker

For remote brokers (e.g., AWS IoT Core, HiveMQ Cloud), update connection URL:

```javascript
// AWS IoT Core
MQTT_URL = 'mqtts://iot-endpoint.amazonaws.com:8883'

// HiveMQ Cloud
MQTT_URL = 'mqtts://broker.hivemq.com:8883'

// Local network printer
MQTT_URL = 'mqtt://192.168.1.100:1883'
```

---

## MQTT Message Format

The simulator expects messages in OctoPrint MQTT plugin format:

### Printer State Message

Publish to topic `octoprint/printer/state`:

```json
{
  "state": {
    "text": "Printing",
    "flags": {
      "operational": true,
      "printing": true,
      "cancelling": false,
      "pausing": false,
      "resuming": false,
      "finishing": false,
      "closedOrError": false,
      "error": false,
      "paused": false,
      "ready": false,
      "sdReady": false
    }
  }
}
```

### Position Update

Publish to topic `octoprint/gcode/machine/position`:

```json
{
  "x": 100.5,
  "y": 80.0,
  "z": 2.5,
  "e": 1234.5
}
```

### Temperature Update

Publish to topic `octoprint/printer/temperature`:

```json
{
  "tool0": {
    "actual": 210.0,
    "target": 210.0
  },
  "bed": {
    "actual": 60.0,
    "target": 60.0
  }
}
```

### Extrusion Event

Publish to topic `octoprint/printer/extrusion` (custom, may need plugin extension):

```json
{
  "is_extruding": true
}
```

---

## Testing Stream Mode

### 1. Using MQTT Client Tools

#### mosquitto_pub (Command Line)

```bash
# Publish a printer state update
mosquitto_pub -h localhost -p 1883 -t octoprint/printer/state -m '{
  "state": {"text": "Printing"}
}'

# Update position
mosquitto_pub -h localhost -p 1883 -t octoprint/gcode/machine/position -m '{
  "x": 150, "y": 100, "z": 3.0, "e": 1250
}'

# Update temperature
mosquitto_pub -h localhost -p 1883 -t octoprint/printer/temperature -m '{
  "tool0": {"actual": 210}, "bed": {"actual": 60}
}'
```
```

#### MQTT Explorer GUI

Download: https://mqtt-explorer.com/

1. Connect to `localhost:1883`
2. Navigate to `printer/state` topic
3. Publish messages using the GUI

### 2. Test Script (Node.js)

Create `test_stream.js`:

```javascript
import mqtt from 'mqtt'

const client = mqtt.connect('mqtt://localhost:1883')

client.on('connect', () => {
  console.log('Connected to MQTT broker')

  // Simulate printer movement
  for (let i = 0; i < 100; i += 10) {
    setTimeout(() => {
      const msg = {
        position: { x: i, y: 50, z: 2, e: 100 + i },
        status: { is_extruding: true, is_printing: true },
        temperature: { nozzle: 210, bed: 60 }
      }
      client.publish('printer/state', JSON.stringify(msg))
      console.log(`Published: X=${i}`)
    }, i * 1000)
  }
})
```

Run with:
```bash
node test_stream.js
```

---

## Console Commands Reference

### Start/Stop Stream Mode

```javascript
// Start stream mode
// Throws error if printer is in process (examples running)
await app.stream.start()

// Check if stream mode is active
app.stream.isActive()  // Returns: true/false

// Stop stream mode
await app.stream.stop()
```

### Get Printer State

```javascript
// Check printer state
const state = app.stream.getAlerts().listeners
app.printer.getPrinterState()

// Check axis positions
console.log(app.xAxis.getPosition())  // X position in mm
console.log(app.yAxis.getPosition())  // Y position in mm
console.log(app.zAxis.getPosition())  // Z position in mm
```

### Alert Subscription

```javascript
// Listen for all alert types
app.stream.getAlerts().onAlert(alert => {
  console.log(`[${alert.type}] ${alert.title}`)
  console.log(`   ${alert.message}`)
})

// Get recent alerts
const recentAlerts = app.stream.getAlerts().getRecentAlerts(10)
console.table(recentAlerts)

// Clear all alerts
app.stream.getAlerts().clearAll()
```

### Filament Rendering

```javascript
// Clear rendered filament
app.filament.clear()

// Set extrusion width and height
app.filament.setWidth(0.4)
app.filament.setHeight(0.2)
```

---

## Troubleshooting

### Stream Mode Won't Start

```
Error: Cannot start stream mode: Printer is in process
```

**Solution:** Wait for examples/standalone mode to complete or reset:
```javascript
// Check if printer is running
app.printer.isRunning  // Should be false

// Stop current print
app.printer.stop()

// Reset printer
await app.printer.reset()

// Try starting stream mode again
await app.stream.start()
```

### MQTT Connection Failed

```
Error: MQTT Connection Failed
```

**Solutions:**
1. Check MQTT broker is running:
   ```bash
   mosquitto -v
   ```

2. Verify connection URL:
   ```javascript
   // Check current config
   import { MQTT_CONFIG } from './stream/mqtt_config.js'
   console.log(MQTT_CONFIG.connection.url)
   ```

3. Check credentials:
   ```bash
   # Test MQTT connection
   mosquitto_sub -h localhost -p 1883 -t printer/state
   ```

4. Check firewall:
   ```bash
   # Verify port is open
   netstat -an | grep 1883
   ```

### Parse Error - Invalid JSON

```
Parse Error: Failed to parse stream data
```

**Solution:** Verify MQTT message is valid JSON:
```bash
# Test with valid JSON
mosquitto_pub -h localhost -p 1883 -t printer/state -m '{"position":{"x":100,"y":80,"z":2.5,"e":1234},"status":{"is_extruding":true},"temperature":{"nozzle":210,"bed":60}}'
```

### Mode Conflict Alert

```
Mode Conflict: Printer switched to standalone mode
```

**Explanation:** Examples mode or manual print started while streaming. Stream mode pauses updates automatically and resumes when printer returns to idle.

### Stream Updates Not Appearing in 3D

1. Check stream mode is active:
   ```javascript
   app.stream.isActive()  // Should return true
   ```

2. Verify MQTT messages are being sent:
   ```bash
   # Subscribe to see all messages
   mosquitto_sub -h localhost -p 1883 -t printer/#
   ```

3. Check browser console for errors:
   - Open DevTools (F12)
   - Look for error messages in Console
   - Check Network tab for MQTT WebSocket connection

4. Verify position data format:
   ```javascript
   // Position must be a number
   { x: 100.5, y: 80.0, z: 2.5 }  // ✅ Correct
   { x: "100", y: "80", z: "2" }   // ❌ Wrong (strings)
   ```

---

## Performance Tips

1. **Limit Update Frequency**: MQTT_CONFIG.debounceMs = 100 (ms)
   ```javascript
   // Don't send updates more than 10x per second
   // Set in mqtt_config.js
   ```

2. **Use Position Updates Only**: Send only position changes instead of full state:
   ```bash
   # Instead of full state (bigger payload)
   mosquitto_pub -h localhost -p 1883 -t printer/state -m '{"position":...}'

   # Send position directly (smaller, faster)
   mosquitto_pub -h localhost -p 1883 -t printer/movement/position -m '{"x":100,"y":80,"z":2.5}'
   ```

3. **Clear Filament Periodically**:
   ```javascript
   // Clear rendered filament to free memory
   app.filament.clear()
   // Filament continues from current nozzle position
   ```

---

## Architecture Notes

### Data Flow

```
Physical Printer (with MQTT)
         ↓
MQTT Broker (Port 1883 / 9001)
         ↓
browser (WebSocket)
         ↓
mqtt_subscriber.js (parses JSON)
         ↓
stream_simulator.js (applies to 3D scene)
         ↓
Axes (x, y, z) + FilamentRenderer
         ↓
3D Visualization
```

### Key Files

| File | Purpose |
|------|---------|
| `mqtt_config.js` | Configuration and topics |
| `mqtt_subscriber.js` | MQTT client and message parsing |
| `stream_simulator.js` | Applies updates to 3D scene |
| `stream_state_provider.js` | Safety checks (printer in process?) |
| `stream_alerts.js` | User notifications |

### Safety Checks

Stream mode validates printer state before accepting updates:
- ✅ Only starts if printer is **idle** (not running examples)
- ✅ Pauses updates if printer switches to **standalone mode**
- ✅ Resumes automatically when printer returns to **idle**

---

## Real-World Examples

### Example 1: Local Printer with MQTT

```bash
# 1. Start MQTT broker locally
mosquitto

# 2. Open simulator in browser

# 3. Start stream mode
# (browser console)
await app.stream.start()

# 4. Publish printer state from printer
# (on printer or test machine)
mosquitto_pub -h localhost -t printer/state -m '{"position":{"x":100,"y":50,"z":2.5,"e":1000},"status":{"is_extruding":true},"temperature":{"nozzle":210,"bed":60}}'
```

### Example 2: Network Printer (Remote MQTT)

```javascript
// Set environment variable
export MQTT_URL="mqtt://192.168.1.100:1883"

// In browser console
await app.stream.start()
```

### Example 3: Continuous Stream (Node.js Publisher)

```javascript
// publisher.js - publishes printer state every 100ms
import { PrusaLink } from 'prusalink'  // or your printer API
import mqtt from 'mqtt'

const client = mqtt.connect('mqtt://localhost:1883')
const prusa = new PrusaLink('192.168.1.50')

setInterval(async () => {
  const state = await prusa.getPrinterState()
  client.publish('printer/state', JSON.stringify({
    position: state.nozzle,
    status: { is_extruding: state.extruding },
    temperature: state.heaters
  }))
}, 100)
```

---

## Support

For issues or questions:
1. Check console output (F12 → Console)
2. Review alerts: `app.stream.getAlerts().getRecentAlerts()`
3. Check MQTT broker logs
4. Verify message format in MQTT Explorer

