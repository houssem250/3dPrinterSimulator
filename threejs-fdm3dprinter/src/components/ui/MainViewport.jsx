import React, { useRef } from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';
import SceneView from '../scene/SceneView.jsx';

export function MainViewport() {
  const { activePrinterId, printers, paneStates, togglePane, terminalLogs, horizontalEvents, placementMode, setPlacementMode, fleetGroups } = useFleetStore();
  const timelineRef = useRef(null);

  const activePrinter = printers[activePrinterId] || printers[0];

  const getPrinterName = (id) => {
    if (id === null) return null;
    for (const group of fleetGroups || []) {
      const asset = group.assets.find(a => a.id === id);
      if (asset) return asset.name;
    }
    return `Asset ${id}`;
  };

  const handleWheel = (e) => {
    if (timelineRef.current) {
      timelineRef.current.scrollLeft += e.deltaY;
    }
  };

  const hasActivePrinter = activePrinterId !== null && printers[activePrinterId];
  const displayPrinter = hasActivePrinter ? printers[activePrinterId] : null;
  const displayEvents = displayPrinter?.timeline || horizontalEvents;
  const displayTitle = displayPrinter 
    ? `TIMELINE - ${getPrinterName(activePrinterId)}` 
    : 'SESSION TIMELINE - GLOBAL PRINT FARM';

  return (
    <main className="canvas-viewport">
      {/* Placement Mode Overlay */}
      {placementMode.active && (
        <div id="placement-overlay" style={{
          position: 'absolute',
          top: '60px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)',
          border: '1px solid var(--accent-amber)',
          padding: '10px 20px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          borderRadius: '4px',
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--accent-amber)', fontWeight: 'bold' }}>DEPLOYMENT MODE: <span className="v-name">{placementMode.pendingAsset?.name}</span></div>
          <div style={{ fontSize: '10px', color: '#ccc' }}>Click an amber ghost-slot in the 3D scene to place.</div>
          <button className="secondary-btn" onClick={() => setPlacementMode(false)} style={{ width: '100%', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>CANCEL DEPLOYMENT</button>
        </div>
      )}

      <div id="threejs-mount">
        <SceneView />
      </div>

      {/* Telemetry HUD - Floating top right */}
      {activePrinter && (
        <div className="floating-pane telemetry-hud">
          <div className="data-row">Layer: <span>{activePrinter.layer || '0'} / {activePrinter.layers || '---'}</span></div>
          <div className="data-row">Speed: <span>{activePrinter.feedrate ? Math.round(activePrinter.feedrate) : '0'} mm/s</span></div>
          <div className="data-row">Z-Height: <span>{activePrinter.pos?.z?.toFixed(2) || '0.00'} mm</span></div>
          <hr />
          <div className="data-row status-amber">AI Stress Score: 18</div>
          <div className="data-row status-green">Belt Tension: 92 N</div>
        </div>
      )}

      {/* G-Code Terminal - Floating bottom left */}
      <div className="floating-pane gcode-terminal" style={{
        marginLeft: paneStates.left ? '320px' : '0px'
      }}>
        <div className="pane-header">G-CODE <span className="close-x-btn">×</span></div>
        <pre id="terminal-output">
          {terminalLogs.map((log, idx) => (
            <div key={idx} className="mb-0.5">
              <span>[{log.time}]</span> {log.type === 'SYS' ? 'SYSTEM: ' : ''}{log.msg}
            </div>
          ))}
        </pre>
      </div>

      {/* Timeline - Floating bottom center/right */}
      {activePrinterId !== null && (
        <div
          className={`sub-pane timeline-wrapper ${!paneStates.bottom ? 'collapsed' : ''}`}
          style={{
            marginLeft: paneStates.left ? '320px' : '0px',
            marginRight: paneStates.right ? '340px' : '0px'
          }}
        >
          <button className="pane-toggle-btn" id="toggle-bottom" onClick={() => togglePane('bottom')}>
            {paneStates.bottom ? '▼' : '▲'}
          </button>
          <div className="pane-header">
            <span className="led">LOG</span>
            <h6>{displayTitle}</h6>
          </div>
          <div id="event-timeline-h" className="timeline-h" ref={timelineRef} onWheel={handleWheel}>
            {displayEvents.map((event, idx) => (
              <div key={idx} className={`event-point-h ${event.status}`}>
                <div className="dot-h"></div>
                <div className="time-h">{event.time}</div>
                <div className="desc-h">{event.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}


