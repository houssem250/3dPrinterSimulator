/**
 * @file TelemetryMocker.js
 * @description Generates and publishes mock telemetry data to the MQTT broker
 * to simulate a live 3D printing session without requiring external hardware or Python scripts.
 *
 * Lifecycle:
 *   start()      → starts tick loop, emits PrintStarted event, resets sim state
 *   pause()      → halts tick without resetting state (no MQTT event)
 *   resume()     → resumes tick from where it paused
 *   stop()       → halts tick, emits PrintDone/PrintCancelled event
 *   stopSilent() → halts tick silently (used on mode switch, not user abort)
 */
export class TelemetryMocker {
  constructor(printerId, publishCallback) {
    this.printerId = printerId;
    this.publish = publishCallback;
    this.intervalId = null;
    this.startTime = null;

    // Simulation state — reset only on start(), preserved on pause/resume
    this._resetState();
  }

  _resetState() {
    this.progress = 0;
    this.nozzleTemp = 25;
    this.bedTemp = 25;
    this.heatsinkTemp = 25;
    this.x = 0;
    this.y = 0;
    this.z = 0.2;
    this.e = 0;
    this.stepCount = 0;
    this.isRunning = false;
  }

  get prefix() {
    return this.printerId === 0 ? 'octoPrint/' : `printer${this.printerId}/`;
  }

  /** Full reset + start tick + emit PrintStarted */
  start() {
    if (this.intervalId) return; // Guard: already running

    this._resetState();
    this.startTime = Date.now();
    this.isRunning = true;

    console.log(`[TelemetryMocker] ▶ Starting mock print for printer ${this.printerId}`);

    // Emit PrintStarted so the timeline registers the event
    this.publish(`${this.prefix}event/PrintStarted`, {
      timestamp: Date.now(),
      filename: 'Benchy_Mock_Print.gcode'
    });

    this.intervalId = setInterval(() => this._tick(), 100);
  }

  /** Pause: stop tick loop, preserve state, no MQTT event */
  pause() {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
    console.log(`[TelemetryMocker] ⏸ Paused mock print`);
  }

  /** Resume: restart tick from saved state, no MQTT event */
  resume() {
    if (this.intervalId) return;
    this.isRunning = true;
    console.log(`[TelemetryMocker] ▶ Resumed mock print`);
    this.intervalId = setInterval(() => this._tick(), 100);
  }

  /** Full stop: halt tick + emit PrintDone (user-initiated abort) */
  stop() {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;

    this.publish(`${this.prefix}event/PrintDone`, {
      timestamp: Date.now(),
      filename: 'Benchy_Mock_Print.gcode',
      time: this.startTime ? (Date.now() - this.startTime) / 1000 : 0
    });

    console.log(`[TelemetryMocker] ⏹ Stopped mock print (PrintDone sent)`);
  }

  /** Silent halt: halt tick without sending any MQTT event (mode switch) */
  stopSilent() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log(`[TelemetryMocker] ✕ Silent stop (mode switch)`);
  }

  _tick() {
    this.stepCount++;
    const now = Date.now();

    // ── 1. Advance progress (0→100% over ~200s) ─────────────────────────────
    if (this.progress < 100) {
      this.progress = Math.min(100, this.progress + 0.05);
    }

    // ── 2. Simulate thermal curves ───────────────────────────────────────────
    const targetNozzle = 215;
    const targetBed = 60;
    const targetHeatsink = 38;

    if (this.nozzleTemp < targetNozzle) {
      this.nozzleTemp = Math.min(targetNozzle, this.nozzleTemp + 2.0);
    } else {
      this.nozzleTemp = targetNozzle + (Math.random() - 0.5) * 0.8;
    }

    if (this.bedTemp < targetBed) {
      this.bedTemp = Math.min(targetBed, this.bedTemp + 0.8);
    } else {
      this.bedTemp = targetBed + (Math.random() - 0.5) * 0.4;
    }

    if (this.heatsinkTemp < targetHeatsink) {
      this.heatsinkTemp = Math.min(targetHeatsink, this.heatsinkTemp + 0.2);
    } else {
      this.heatsinkTemp = targetHeatsink + (Math.random() - 0.5) * 0.2;
    }

    // ── 3. Motion (only once nozzle is hot) ─────────────────────────────────
    const isHeated = this.nozzleTemp >= 200;
    if (isHeated && this.progress < 100) {
      this.x = 100 + Math.sin(this.stepCount * 0.2) * 80;
      this.y = 100 + Math.cos(this.stepCount * 0.2) * 80;
      this.z = 0.2 + Math.floor(this.progress / 5) * 0.2;
      this.e += 0.1;
    }

    // ── 4. Temperature — every 1s (10 ticks) ─────────────────────────────────
    if (this.stepCount % 10 === 0) {
      this.publish(`${this.prefix}temperature`, {
        temp: {
          nozzle: Math.round(this.nozzleTemp),
          nozzleTarget: targetNozzle,
          bed: Math.round(this.bedTemp),
          bedTarget: targetBed
        }
      });
      this.publish('sensor/esp8266/temperature', {
        temp_c: Number(this.heatsinkTemp.toFixed(2))
      });
    }

    // ── 5. Progress — every 1s (10 ticks) ────────────────────────────────────
    if (this.stepCount % 10 === 0) {
      const elapsed = Math.floor((now - this.startTime) / 1000);
      const totalEst = 200;
      this.publish(`${this.prefix}progress/printing`, {
        progress: Math.floor(this.progress),
        time_elapsed: elapsed,
        time_left: Math.max(0, totalEst - elapsed)
      });
    }

    // ── 6. Motion — every 200ms (2 ticks) ────────────────────────────────────
    if (isHeated && this.stepCount % 2 === 0 && this.progress < 100) {
      this.publish(`${this.prefix}motion`, {
        x: Number(this.x.toFixed(2)),
        y: Number(this.y.toFixed(2)),
        z: Number(this.z.toFixed(2)),
        e: Number(this.e.toFixed(3)),
        is_extruding: true,
        cmdIndex: this.stepCount
      });
    }

    // ── 7. Filament flow — every 500ms (5 ticks) ─────────────────────────────
    if (this.stepCount % 5 === 0) {
      const extruding = isHeated && this.progress < 100;
      const flowRate = extruding ? 5.0 + (Math.random() - 0.5) * 0.5 : 0;
      const counts = extruding ? Math.round(flowRate * 0.5 / 0.0539) : 0;
      this.publish('sensor/filament/flow', {
        flow_mm_s: Number(flowRate.toFixed(2)),
        counts
      });
    }

    // ── 8. IMU vibration — every 100ms (every tick) ──────────────────────────
    // Raw acc delta values — MqttService will window-aggregate these server-side
    let magBase = isHeated && this.progress < 100 ? 45 : 2;
    const anomaly = (this.stepCount % 200) >= 100 && (this.stepCount % 200) < 130;
    if (anomaly) magBase = 580;

    const noise = Math.random() * (anomaly ? 50 : 10);
    const dz = magBase + noise;

    this.publish('sensor/esp8266/imu', {
      acc_z: 1020 + (Math.random() - 0.5) * 10,
      delta_acc_x: (Math.random() - 0.5) * 5,
      delta_acc_y: (Math.random() - 0.5) * 5,
      delta_acc_z: dz
    });
  }
}
