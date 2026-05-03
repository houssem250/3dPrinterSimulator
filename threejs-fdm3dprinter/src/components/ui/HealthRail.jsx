import React, { useState } from 'react';

const systemAlerts = [
  {
      id: 1,
      type: 'critical',
      title: 'THERMAL RUNAWAY PROTECTION',
      time: '12:04',
      detail: 'Sensor E0 detected a temperature spike exceeding 15°C/s. Heating has been cut. Check thermistor seating and heater cartridge wiring immediately.'
  },
  {
      id: 2,
      type: 'warning',
      title: 'Z-AXIS SQUARING ERROR',
      time: '11:50',
      detail: 'Lead screw deviation detected on Z2 motor (>0.12mm). Recalibration recommended before starting high-precision prints.'
  }
];

export function HealthRail() {
  const [expandedAlert, setExpandedAlert] = useState(null);

  const toggleAlert = (id) => {
    setExpandedAlert(expandedAlert === id ? null : id);
  };

  return (
    <aside className="right-rail">
      <div className="pane-header mb-0 border-b-0 pb-0 text-[10px] uppercase tracking-widest text-white font-bold">
        AI PREDICTIVE HEALTH RAIL
      </div>
      
      <section className="sub-pane alerts-feed">
        <h6>Chronological Aggregated Alerts</h6>
        <div className="alert-feed flex flex-col gap-2">
          {systemAlerts.map(alert => (
            <div 
              key={alert.id} 
              className={`alert-item cursor-pointer border rounded bg-[rgba(255,255,255,0.03)] transition-all overflow-hidden ${
                expandedAlert === alert.id ? 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.06)]' : 'border-[var(--border)]'
              } ${alert.type === 'critical' ? 'border-l-[3px] border-l-[var(--accent-red)]' : 'border-l-[3px] border-l-[var(--accent-amber)]'}`}
              onClick={() => toggleAlert(alert.id)}
            >
              <div className="alert-header p-2.5 flex justify-between items-center text-[11px]">
                <div>
                  <span className={`mr-2 ${alert.type === 'critical' ? 'text-[var(--accent-red)]' : 'text-[var(--accent-amber)]'}`}>●</span>
                  <span className="font-bold">{alert.title}</span>
                </div>
                <span className={`expand-icon text-[8px] transition-transform ${expandedAlert === alert.id ? 'rotate-180' : ''}`}>▼</span>
              </div>

              <div className={`alert-detail text-[10px] text-[var(--text-dim)] bg-[rgba(0,0,0,0.2)] transition-all ${
                expandedAlert === alert.id ? 'max-h-[200px] p-2.5 border-t border-[var(--border)]' : 'max-h-0 py-0 px-2.5'
              }`}>
                <p className="mb-2">{alert.detail}</p>
                <button className="action-btn text-[9px] bg-transparent border border-[var(--border)] px-2 py-1 hover:bg-[rgba(255,255,255,0.05)]">
                  FIX NOW
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sub-pane">
        <h6>Real-time Vibration FFT (ADXL345)</h6>
        <div className="h-24 w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] rounded flex items-center justify-center text-[var(--text-dim)] text-[9px]">
          [CANVAS]
        </div>
      </section>

      <section className="sub-pane">
        <h6>Nozzle/Bed/heatsink Thermal Health</h6>
        <div className="h-24 w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.05)] rounded flex items-center justify-center text-[var(--text-dim)] text-[9px]">
          [CANVAS]
        </div>
      </section>

      <section className="sub-pane fleet-overview">
        <h6>Fleet Health Overview Panel</h6>
        <div className="donut-container flex items-center justify-between p-2">
          <div className="h-16 w-16 rounded-full border-4 border-[var(--accent-green)] border-t-[rgba(255,255,255,0.1)]"></div>
          <div className="donut-stats text-right text-[10px]">
            <p className="font-bold text-white">Health: 85%</p>
            <p className="text-[var(--text-dim)] mt-1">Open Tickets: 3</p>
          </div>
        </div>
      </section>
    </aside>
  );
}
