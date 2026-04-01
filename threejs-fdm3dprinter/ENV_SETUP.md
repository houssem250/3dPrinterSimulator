# Environment Setup Guide

## Quick Start

1. **Copy the example file:**
```bash
cp .env.example .env.local
```

2. **Edit `.env.local` with your MQTT broker details:**
```env
MQTT_BROKER=192.168.1.100
MQTT_PORT=1883
MQTT_USERNAME=admin
MQTT_PASSWORD=your_password_here
```

3. **Start the dev server:**
```bash
npm run dev
```

The environment variables will be loaded automatically.

---

## Environment Variables Reference

### MQTT Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_MQTT_BROKER` | `localhost` | MQTT broker hostname/IP |
| `VITE_MQTT_PORT` | `1883` | MQTT broker port (1883 = TCP, 9001 = WebSocket) |
| `VITE_MQTT_CLIENT_ID` | Auto-generated | Unique client identifier |
| `VITE_MQTT_USERNAME` | (empty) | MQTT authentication username |
| `VITE_MQTT_PASSWORD` | (empty) | MQTT authentication password |

### MQTT Topics

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_MQTT_TOPIC_STATE` | `printer/state` | Full printer state updates |
| `VITE_MQTT_TOPIC_MOVEMENT` | `printer/movement/position` | Position-only updates |
| `VITE_MQTT_TOPIC_EXTRUSION` | `printer/movement/extrusion` | Extrusion events |
| `VITE_MQTT_TOPIC_MODE` | `simulator/mode` | Simulator status publishing |

### Stream Mode Settings

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_STREAM_DEBOUNCE_MS` | `100` | Min milliseconds between updates |
| `VITE_STREAM_AUTO_START` | `false` | Auto-start stream on load |
| `VITE_OCTOPRINT_ENABLED` | `false` | Enable OctoPrint integration |
| `VITE_OCTOPRINT_URL` | `http://localhost:5000` | OctoPrint server URL |
| `VITE_OCTOPRINT_API_KEY` | (empty) | OctoPrint API key (⚠️ SENSITIVE) |

---

## Important Security Notes

### ⚠️ NEVER commit `.env.local`
The `.gitignore` file already excludes it, but always verify:

```bash
# Check it's ignored
git check-ignore -v .env.local

# Should output:
# .env.local      .gitignore:17:/.env.local
```

### API Keys & Passwords
- All sensitive data goes in `.env.local`
- Never paste credentials in console/code
- Use `.env.example` to show non-sensitive structure only

### Local Development
```bash
# .env.local for development (never committed)
VITE_MQTT_USERNAME=dev_user
VITE_MQTT_PASSWORD=dev_password_123
VITE_OCTOPRINT_API_KEY=-ZIuYEWPn2dFtrUt4IEbQwkItpUnjvYhzQRFQ7B4Wj8
```

### Production Deployment
For cloud deployment, set environment variables via:
- **GitHub Actions:** Repository secrets (Settings → Secrets → Actions)
- **Vercel/Netlify:** Project environment settings
- **Docker:** `docker run -e VITE_MQTT_BROKER=...`

---

## Testing Configuration

### Test with Local MQTT Broker

**1. Install Mosquitto:**
```bash
# macOS
brew install mosquitto

# Ubuntu/Debian
sudo apt-get install mosquitto

# Windows
# Download from https://mosquitto.org/download/
```

**2. Start broker:**
```bash
mosquitto -v
```

**3. Set `.env.local`:**
```env
VITE_MQTT_BROKER=localhost
VITE_MQTT_PORT=1883
```

**4. Test connection:**
```bash
# In another terminal
mosquitto_pub -h localhost -t printer/state -m '{"position":{"x":10,"y":10,"z":2},"status":{"is_extruding":false},"temperature":{"nozzle":20,"bed":20}}'
```

### Test with Remote MQTT

**1. Update `.env.local`:**
```env
VITE_MQTT_BROKER=192.168.1.100
VITE_MQTT_PORT=1883
VITE_MQTT_USERNAME=admin
VITE_MQTT_PASSWORD=password
```

**2. Verify connectivity:**
```bash
# From your machine
mosquitto_sub -h 192.168.1.100 -u admin -P password -t printer/#
```

---

## Vite Environment Variable Syntax

In Vite, all client-side environment variables must:

1. **Start with `VITE_` prefix:**
   ```env
   ✅ VITE_MQTT_BROKER=localhost
   ❌ MQTT_BROKER=localhost        # Won't be exposed
   ```

2. **Be accessed via `import.meta.env`:**
   ```javascript
   // ✅ Correct (in browser)
   const url = import.meta.env.VITE_MQTT_BROKER

   // ❌ Wrong (in browser)
   const url = process.env.MQTT_BROKER  // undefined
   ```

3. **Be defined in `.env` files (not in code):**
   ```javascript
   // ✅ Correct
   // .env.local
   VITE_API_KEY=secret123

   // ❌ Wrong
   // Don't hardcode in code
   const apiKey = 'secret123'
   ```

---

## Troubleshooting

### "Connection refused" Error

**Check if broker is running:**
```bash
# Test TCP connection
nc -zv 192.168.1.100 1883

# Should output: "Connection successful" or similar
```

**Check firewall:**
```bash
# Linux: Check if port is open
sudo ufw allow 1883/tcp

# Windows: Allow port in Windows Defender
# Settings → Firewall → Allow apps through firewall
```

### Env variables not loading

**Verify Vite config:**
```javascript
// vite.config.js should include env loading
export default defineConfig({
  // Vite automatically loads .env files
})
```

**Restart dev server:**
```bash
# Changes to .env.local require server restart
npm run dev
# Stop (Ctrl+C) and start again
```

**Check browser console:**
```javascript
// Debug: See what's loaded
console.log(import.meta.env.VITE_MQTT_BROKER)
```

### "MQTT payload is undefined"

**Check message format:**
```bash
# ✅ Valid JSON
mosquitto_pub -h localhost -t printer/state -m '{"position":{"x":100}}'

# ❌ Invalid
mosquitto_pub -h localhost -t printer/state -m '{position:{x:100}}'  # Not JSON
```

---

## Git Commands Reference

```bash
# Check if .env.local is ignored
git status

# Should NOT show .env.local

# Verify gitignore rule
git check-ignore .env.local

# Emergency: Remove accidentally committed env file
# (Only if already committed)
git rm --cached .env.local
git commit -m "Remove sensitive .env.local"
```

---

## Support

- **MQTT Issues:** Use MQTT Explorer to debug topics/payloads
- **Env Loading:** Check browser DevTools → Console for errors
- **Security:** Never share `.env.local` or screenshots showing credentials

