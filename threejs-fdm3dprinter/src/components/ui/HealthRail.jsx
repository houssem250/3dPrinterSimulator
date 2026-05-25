import React, { useState } from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';
import { ThermalChart } from './ThermalChart.jsx';

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

  const getWizardSteps = (title = '') => {
    if (title.toUpperCase().includes('THERMAL')) {
      return (
        <div className="step-text">
          <span style={{ color: 'var(--accent-green)' }}>[STEP 1]</span> Verify heater cartridge resistance via Multi-meter or check for loose terminal screws.
        </div>
      );
    }
    if (title.toUpperCase().includes('Z-AXIS')) {
      return (
        <div className="step-text">
          <span style={{ color: 'var(--accent-green)' }}>[STEP 1]</span> Clean Z-axis lead screws, check couplers, and lubricate rods before running mechanical diagnostic.
        </div>
      );
    }
    return (
      <div className="step-text">
        <span style={{ color: 'var(--accent-green)' }}>[STEP 1]</span> Verify hardware resistance and check for loose terminal connections.
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

      <section className="sub-pane">
        <h6>Real-time Vibration FFT (ADXL345)</h6>
        <canvas id="fft-chart"></canvas>
      </section>

      <section className="sub-pane">
        <h6>Nozzle/Bed/heatsink Thermal Health</h6>
        <div style={{ height: '140px' }}>
          <ThermalChart history={printers[activePrinterId]?.tempHistory || []} />
        </div>
      </section>

      <section className="sub-pane fleet-overview">
        <h6>New 'Fleet Health Overview' Panel</h6>
        <div className="donut-container">
          <canvas id="health-donut"></canvas>
          <div className="donut-stats">
            <p style={{ margin: '10px 0' }}>Health: 85%</p>
            <p style={{ margin: '10px 0' }}>Open Tickets: 3</p>
          </div>
        </div>
      </section>
    </aside>
  );
}

