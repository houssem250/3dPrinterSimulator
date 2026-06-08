import { useFleetStore } from '../store/useFleetStore';

class MaintenanceEngine {
  constructor() {
    this.intervalId = null;
    this.evaluationIntervalMs = 1000; // Evaluate every second
  }

  start() {
    if (this.intervalId) return;
    console.log('[MaintenanceEngine] Starting health monitoring engine...');
    this.intervalId = setInterval(() => this.evaluateFleet(), this.evaluationIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[MaintenanceEngine] Stopped.');
    }
  }

  evaluateFleet() {
    const state = useFleetStore.getState();
    const printers = state.printers;

    for (const id in printers) {
      this.evaluatePrinter(printers[id], state);
    }
  }

  evaluatePrinter(printer, storeState) {
    // Only evaluate if the printer is actively printing
    if (!printer.isPrinting) return;

    this.checkHeatCreep(printer, storeState);
    this.checkThermalUnderheating(printer, storeState);
    this.checkClog(printer, storeState);
    this.checkVibration(printer, storeState);
  }

  // A. Heatsink Overheating (Heat Creep)
  checkHeatCreep(printer, storeState) {
    const history = printer.tempHistory;
    if (!history || history.length < 5) return;

    const now = Date.now();
    // Get samples from the last 30 seconds
    const windowSamples = history.filter(h => now - h.time <= 30000);
    if (windowSamples.length < 2) return;

    const oldest = windowSamples[0];
    const newest = windowSamples[windowSamples.length - 1];

    // Use heatsink temp if available, fallback to temp_c equivalent if named differently.
    // In updatePrinter, it's pushed as `heatsink`.
    const oldTemp = oldest.heatsink;
    const newTemp = newest.heatsink;

    // Time delta in minutes
    const dtMin = (newest.time - oldest.time) / 60000;
    if (dtMin <= 0) return;

    const slope = (newTemp - oldTemp) / dtMin;

    // Stage 3 (Failure)
    if (newTemp > 61.3) {
      this.dispatchAlert('critical', 'CRITICAL HEAT CREEP', `Heatsink temperature reached catastrophic levels (${newTemp.toFixed(1)}°C). Immediate abort required to prevent fire hazard.`, storeState, printer.id);
      this.executeEmergencyAction('abort', printer.id, storeState);
    }
    // Stage 2 (Critical)
    else if (newTemp > 52.1 && slope > 3.2) {
      this.dispatchAlert('critical', 'SEVERE HEAT CREEP', `Heatsink temperature rapidly rising (${newTemp.toFixed(1)}°C at ${slope.toFixed(1)}°C/min). Pausing print to cool down.`, storeState, printer.id);
      this.executeEmergencyAction('pause', printer.id, storeState);
    }
    // Stage 1 (Warning)
    else if (newTemp > 44.7 && slope > 1.8) {
      this.dispatchAlert('warning', 'HEAT CREEP WARNING', `Heatsink temperature is abnormally high (${newTemp.toFixed(1)}°C). Monitoring closely.`, storeState, printer.id);
    }
  }

  // B. Nozzle Thermal Runaway (Underheating)
  checkThermalUnderheating(printer, storeState) {
    const history = printer.tempHistory;
    if (!history || history.length < 5) return;

    const now = Date.now();
    // 20-second rolling window
    const windowSamples = history.filter(h => now - h.time <= 20000);
    if (windowSamples.length < 5) return;

    // Check if target is set to a printable temp
    const target = windowSamples[0].nozzleTarget;
    if (!target || target < 150) return;

    // Calculate rolling minimum of the delta (actual - target)
    let minDelta = Infinity;
    for (const h of windowSamples) {
      const delta = h.nozzle - h.nozzleTarget;
      if (delta < minDelta) minDelta = delta;
    }

    // If the rolling minimum is STILL worse than -10C over the 20s window
    // (Meaning it never recovered to within 10C of the target)
    if (minDelta < -10) {
      this.dispatchAlert('critical', 'THERMAL RUNAWAY (UNDERHEATING)', `Nozzle is failing to hold target temperature (Delta: ${minDelta.toFixed(1)}°C). Heater cartridge may be failing.`, storeState, printer.id);
      this.executeEmergencyAction('pause', printer.id, storeState);
    }
  }

  // C. No Filament Flow
  checkClog(printer, storeState) {
    const history = printer.flowHistory;
    if (!history || history.length < 5) return;

    const now = Date.now();
    // 10-second rolling window
    const windowSamples = history.filter(h => now - h.time <= 10000);
    if (windowSamples.length < 3) return;

    // We only care if the printer is actively trying to extrude
    if (printer.feedrate && printer.feedrate > 0) {
      const oldestFlow = windowSamples[0].cumulativeMm || 0;
      const newestFlow = windowSamples[windowSamples.length - 1].cumulativeMm || 0;
      const deltaFlow = newestFlow - oldestFlow;

      // If feedrate is > 0 but no flow is measured over 10 seconds
      if (deltaFlow <= 0) {
        this.dispatchAlert('critical', 'NO FLOW / CLOG DETECTED', `Live feedrate is active, but zero filament movement detected in the last 10 seconds. Check for clog or filament runout.`, storeState, printer.id);
        this.executeEmergencyAction('pause', printer.id, storeState);
      }
    }
  }

  // D. Erratic Vibrations (Loose Belts/Wobble)
  checkVibration(printer, storeState) {
    const history = printer.vibHistory;
    if (!history || history.length < 50) return; // Need at least 50 samples

    const now = Date.now();
    // Last 50 samples roughly corresponds to a short window depending on Hz.
    const samples = history.slice(-50);
    
    // Calculate standard deviation of acc_z (Wobble)
    let sumZ = 0;
    let validSamples = 0;
    samples.forEach(h => {
      if (h.acc_z !== undefined && h.acc_z !== null) {
        sumZ += h.acc_z;
        validSamples++;
      }
    });

    if (validSamples < 2) return;

    const meanZ = sumZ / validSamples;
    let sqDiffSumZ = 0;

    samples.forEach(h => {
      if (h.acc_z !== undefined && h.acc_z !== null) {
        sqDiffSumZ += Math.pow(h.acc_z - meanZ, 2);
      }
    });

    const stdZ = Math.sqrt(sqDiffSumZ / validSamples);

    // Threshold porting from run_model.py (needs calibration in live environment)
    // 300 LSB is a placeholder representing a severe wobble standard deviation
    if (stdZ > 300) {
      this.dispatchAlert('warning', 'ERRATIC X-CARRIAGE WOBBLE', `Abnormal side-to-side vibration detected (StdDev: ${stdZ.toFixed(1)} LSB). Check X-axis belt tension and V-rollers.`, storeState, printer.id);
    }
  }

  // Helpers
  dispatchAlert(type, title, detail, storeState, printerId) {
    // Inject the printer ID into the title so we know which one failed
    const fullTitle = `[${printerId}] ${title}`;
    storeState.addSystemAlert({
      type,
      title: fullTitle,
      detail
    });
  }

  executeEmergencyAction(action, printerId, storeState) {
    // In a full implementation, this would publish to an MQTT topic.
    // For now, we update the UI state to pause/abort.
    console.warn(`[MaintenanceEngine] Executing autonomous ${action} on ${printerId}`);
    if (action === 'pause') {
      storeState.updateActiveJob({ isPaused: true, isPrinting: true });
    } else if (action === 'abort') {
      storeState.updateActiveJob({ isPrinting: false, isPaused: false });
    }
  }
}

export const maintenanceEngine = new MaintenanceEngine();
