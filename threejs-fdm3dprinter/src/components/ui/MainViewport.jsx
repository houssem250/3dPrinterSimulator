import React from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';
import SceneView from '../scene/SceneView.jsx';

export function MainViewport() {
  const { activePrinterId, printers } = useFleetStore();
  const activePrinter = printers[activePrinterId] || printers[0];

  return (
    <main className="canvas-viewport relative h-full w-full">
      {/* 3D Scene */}
      <SceneView />
      
      {/* Telemetry HUD - Floating top right */}
      {activePrinter && (
        <div className="floating-pane telemetry-hud top-5 right-5 p-4 w-48 font-mono text-xs shadow-lg bg-[rgba(22,22,22,0.75)] backdrop-blur-md border border-[var(--border)] rounded absolute z-10">
          <div className="data-row flex justify-between mb-1.5">
            <span>Layer:</span> 
            <span className="text-[var(--accent-green)]">{activePrinter.layer || '0'} / ---</span>
          </div>
          <div className="data-row flex justify-between mb-1.5">
            <span>Speed:</span> 
            <span className="text-white">{activePrinter.feedrate || '0'} mm/min</span>
          </div>
          <div className="data-row flex justify-between mb-1.5">
            <span>Z-Height:</span> 
            <span className="text-white">{activePrinter.pos?.z?.toFixed(2) || '0.00'} mm</span>
          </div>
          <hr className="border-[var(--border)] my-2" />
          <div className="data-row status-amber text-[var(--accent-amber)] mb-1">AI Stress Score: 18</div>
          <div className="data-row status-green text-[var(--accent-green)]">Belt Tension: 92 N</div>
        </div>
      )}

      {/* G-Code Terminal - Floating bottom left */}
      <div className="floating-pane gcode-terminal absolute bottom-5 left-5 w-[380px] h-[160px] bg-[rgba(5,10,5,0.85)] border border-[rgba(0,255,194,0.2)] shadow-[0_0_20px_rgba(0,0,0,0.5),inset_0_0_10px_rgba(0,255,194,0.05)] rounded flex flex-col overflow-hidden z-10">
        <div className="pane-header bg-[rgba(0,255,194,0.05)] px-3 py-1.5 text-[10px] tracking-widest border-b border-[var(--border)] flex justify-between items-center text-white">
          G-CODE
          <span className="close-x-btn cursor-pointer text-[var(--text-dim)] hover:text-[var(--accent-red)] text-lg leading-none">×</span>
        </div>
        <pre id="terminal-output" className="m-0 p-3 text-[11px] leading-snug font-mono text-[var(--accent-green)] flex-1 overflow-y-auto" style={{
          textShadow: '0 0 5px rgba(0, 255, 194, 0.5)',
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)'
        }}>
          {/* Terminal output will be injected here */}
          <div className="mb-0.5"><span className="opacity-60 font-light mr-2">[12:00:00]</span> SYSTEM: Digital Twin Sync Active</div>
          <div className="mb-0.5"><span className="opacity-60 font-light mr-2">[12:00:01]</span> Connected to Mosquitto Broker</div>
          <div className="mb-0.5"><span className="opacity-60 font-light mr-2">[12:00:05]</span> Awaiting motion stream...</div>
        </pre>
      </div>

      {/* Timeline - Floating bottom center/right */}
      <div className="floating-pane sub-pane timeline-wrapper absolute bottom-5 right-5 bg-[rgba(22,22,22,0.75)] backdrop-blur-md border border-[var(--border)] p-3 rounded w-[380px] z-10">
        <div className="pane-header flex gap-2 items-center mb-2">
          <span className="led text-[var(--accent-green)] text-[10px] font-bold">● LOG</span>
          <h6 className="m-0 text-[9px] text-[var(--text-dim)] uppercase">SESSION TIMELINE</h6>
        </div>
        <div id="event-timeline-h" className="timeline-h flex justify-between text-[10px] text-[var(--text-dim)] pt-2 relative border-t border-[rgba(255,255,255,0.05)]">
          {/* Dummy timeline events */}
          <div className="text-center">
            <div className="text-[var(--accent-green)]">●</div>
            <div>08:00</div>
            <div className="text-[8px]">System Warmup</div>
          </div>
          <div className="text-center">
            <div className="text-[var(--accent-green)]">●</div>
            <div>08:20</div>
            <div className="text-[8px]">Print Started</div>
          </div>
          <div className="text-center opacity-50">
            <div>○</div>
            <div>---</div>
            <div className="text-[8px]">Planned Finish</div>
          </div>
        </div>
      </div>
    </main>
  );
}
