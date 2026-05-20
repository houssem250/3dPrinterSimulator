import React from 'react';
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

  const handleFixNow = (e, id) => {
    e.stopPropagation();
    setAlertFixing(id, true);
  };

  const handleCloseWizard = (e, id, resolve = false) => {
    e.stopPropagation();
    if (resolve) {
      addLogEntry("Hardware Diagnostic Performed - Alert Resolved", "SYS");
      addTimelineEvent("Manual Maintenance Done", "completed");
      resolveAlert(id);
    } else {
      setAlertFixing(id, false);
    }
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
          {systemAlerts.map((alert) => (
            <div 
              key={alert.id} 
              className={`alert-item ${alert.isExpanded ? 'expanded' : ''} ${alert.isFixing ? 'fixing' : ''} ${alert.type}`}
              onClick={() => toggleAlert(alert.id)}
            >
              <div className="alert-header">
                <div>
                  <span className={`status-dot ${alert.type}`}>●</span>
                  <span style={{ fontWeight: 'bold' }}>{alert.title}</span>
                </div>
                <span className="expand-icon">{alert.isExpanded ? '▲' : '▼'}</span>
              </div>

              {!alert.isFixing ? (
                <div className="alert-detail">
                  <p>{alert.detail}</p>
                  <button className="action-btn initial-fix-btn" onClick={(e) => handleFixNow(e, alert.id)}>
                    FIX NOW
                  </button>
                </div>
              ) : (
                <div className="fix-wizard-pane">
                  <div className="step-text">
                    <span style={{ color: 'var(--accent-green)' }}>[STEP 1]</span> 
                    Verify hardware resistance and check for loose terminal connections.
                  </div>
                  <div className="control-grid" style={{ marginTop: '15px' }}>
                    <button className="action-btn" onClick={(e) => handleCloseWizard(e, alert.id, true)}>
                      DIAGNOSE / TEST
                    </button>
                    <button className="secondary-btn" onClick={(e) => handleCloseWizard(e, alert.id, false)}>
                      DONE / DISCARD
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
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

