import React, { useState } from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';
import { ThermalChart } from './ThermalChart.jsx';
import { VibrationChart } from './VibrationChart.jsx';
import { FlowChart } from './FlowChart.jsx';

export function HealthRail() {
  const { 
    paneStates, 
    togglePane, 
    systemAlerts, 
    toggleAlert, 
    setAlertFixing, 
    resolveAlert, 
    addLogEntry, 
    addTimelineEvent,
    activePrinterId,
    printers
  } = useFleetStore();

  const [resolvingIds, setResolvingIds] = useState([]);

  const handleFixNow = (e, id) => {
    e.stopPropagation();
    setAlertFixing(id, true);
  };

  const handleCloseWizard = (e, id, resolve = false) => {
    e.stopPropagation();
    if (resolve) {
      setResolvingIds(prev => [...prev, id]);
      
      const alertObj = systemAlerts.find(a => a.id === id);
      const logText = alertObj 
        ? `Hardware Diagnostic Performed - Resolved ${alertObj.title}`
        : "Hardware Diagnostic Performed - Alert Resolved";
      
      addLogEntry(`SYSTEM: ${logText}`, "SYS");
      addTimelineEvent(alertObj ? `Resolved: ${alertObj.title}` : "Manual Maintenance Done", "completed");
      
      setTimeout(() => {
        resolveAlert(id);
        setResolvingIds(prev => prev.filter(x => x !== id));
      }, 300);
    } else {
      setAlertFixing(id, false);
    }
  };

  const FAULT_GUIDES = {
    'HEAT CREEP': [
      { text: 'Pause print (auto-executed if critical).' },
      { text: 'Increase cooling fan speed.', action: 'SET FAN 100%' },
      { text: 'Check heatsink fan for blockage/failure.' },
      { text: 'Check PTFE tube clearance from heatblock.' },
      { text: 'Consider all-metal hotend upgrade.' }
    ],
    'THERMAL RUNAWAY': [
      { text: 'Pause print and let cool.' },
      { text: 'Check heater cartridge resistance (nominally 12–16Ω).' },
      { text: 'Check thermistor resistance (100kΩ at room temp).' },
      { text: 'Tighten grub screws on heater block.' },
      { text: 'Replace heater/thermistor if damaged.' }
    ],
    'CLOG': [
      { text: 'Pause print (auto-executed if critical).' },
      { text: 'Attempt cold pull / atomic pull.' },
      { text: 'Heat nozzle to 250°C and manually push filament.', action: 'HEAT NOZZLE' },
      { text: 'Disassemble and clean nozzle.' },
      { text: 'Check extruder gear for stripping marks.' }
    ],
    'WOBBLE': [
      { text: 'Power off motors.', action: 'M84' },
      { text: 'Check X-belt tension (vibrates like low guitar string).' },
      { text: 'Tighten belt with tensioner or idler adjustment.' },
      { text: 'Check V-rollers — should have slight resistance.' },
      { text: 'Check stepper pulley grub screw.' }
    ]
  };

  const getWizardSteps = (title = '') => {
    const upperTitle = title.toUpperCase();
    const faultKey = Object.keys(FAULT_GUIDES).find(key => upperTitle.includes(key));
    const steps = faultKey ? FAULT_GUIDES[faultKey] : [
      { text: 'Verify hardware resistance and check for loose terminal connections.' }
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step, idx) => (
          <div key={idx} className="step-text" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            <span style={{ color: 'var(--accent-green)', flexShrink: 0 }}>[{idx + 1}]</span> 
            <span style={{ flex: 1 }}>{step.text}</span>
            {step.action && (
              <button style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border)', 
                color: 'white', fontSize: '8px', padding: '2px 4px', borderRadius: '2px', cursor: 'pointer'
              }}>
                {step.action}
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <aside className={`right-rail ${!paneStates.right ? 'collapsed' : ''}`}>
      <button className="pane-toggle-btn" id="toggle-right" onClick={() => togglePane('right')}>
        {paneStates.right ? '▶' : '◀'}
      </button>
      
      <div className="pane-header">AI PREDICTIVE HEALTH RAIL</div>
      
      <section className="sub-pane alerts-feed">
        <h6>Chronological Aggregated Alerts</h6>
        <div id="alert-feed-container" className="alert-feed">
          {systemAlerts.map((alert) => {
            const isResolving = resolvingIds.includes(alert.id);
            return (
              <div 
                key={alert.id} 
                className={`alert-item ${alert.isExpanded ? 'expanded' : ''} ${alert.isFixing ? 'fixing' : ''} ${alert.type}`}
                onClick={() => toggleAlert(alert.id)}
                style={{
                  transition: 'transform 0.3s ease, opacity 0.3s ease, max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), margin-bottom 0.3s ease',
                  ...(isResolving ? { transform: 'translateX(50px)', opacity: 0, maxHeight: 0, marginBottom: 0, border: 'none' } : {})
                }}
              >
                <div className="alert-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`status-dot ${alert.type}`}>●</span>
                    <span style={{ fontWeight: 'bold' }}>{alert.title}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{alert.time}</span>
                    <span className="expand-icon">▼</span>
                  </div>
                </div>

                <div className="alert-detail">
                  <p>{alert.detail}</p>
                  <button className="action-btn initial-fix-btn" onClick={(e) => handleFixNow(e, alert.id)}>
                    FIX NOW
                  </button>
                </div>

                <div className="fix-wizard-pane">
                  {getWizardSteps(alert.title)}
                  <div className="control-grid" style={{ marginTop: '15px' }}>
                    <button className="action-btn" onClick={(e) => handleCloseWizard(e, alert.id, true)}>
                      DIAGNOSE / TEST
                    </button>
                    <button className="secondary-btn" onClick={(e) => handleCloseWizard(e, alert.id, false)}>
                      DONE / DISCARD
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {activePrinterId != null && (
        <>
          <section className="sub-pane">
            <h6>Vibration Magnitude (IMU Δacc)</h6>
            <div style={{ height: '140px' }}>
              <VibrationChart history={printers[activePrinterId]?.vibHistory || []} />
            </div>
          </section>

          <section className="sub-pane">
            <h6>Nozzle/Bed/heatsink Thermal Health</h6>
            <div style={{ height: '140px' }}>
              <ThermalChart history={printers[activePrinterId]?.tempHistory || []} />
            </div>
          </section>

          <section className="sub-pane">
            <h6>Filament Flow vs. Extrusion</h6>
            <div style={{ height: '140px' }}>
              <FlowChart history={printers[activePrinterId]?.flowHistory || []} />
            </div>
          </section>
        </>
      )}
    </aside>
  );
}

