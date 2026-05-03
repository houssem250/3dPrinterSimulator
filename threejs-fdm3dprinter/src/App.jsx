import React from 'react';
import SceneView from './components/scene/SceneView';
import { useFleetStore } from './store/useFleetStore';
import { Activity, Thermometer, Box, Cpu } from 'lucide-react';

/**
 * Main Application Component
 * 
 * A Hybrid Digital Twin Dashboard.
 * Background: High-performance Three.js Simulation.
 * Foreground: React/Tailwind Telemetry Overlays.
 */
const App = () => {
  const { printers, activePrinterId } = useFleetStore();
  const printerList = Object.values(printers);
  const activePrinter = printers[activePrinterId];

  return (
    <div className="relative w-full h-screen overflow-hidden text-slate-100 font-sans selection:bg-amber-500/30">
      {/* 1. 3D Digital Twin Core */}
      <SceneView />

      {/* 2. Global Fleet Sidebar */}
      <div className="absolute top-6 left-6 bottom-6 w-80 pointer-events-none flex flex-col gap-4">
        <header className="pointer-events-auto bg-slate-900/60 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-2xl">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight uppercase italic">Print Farm <span className="text-amber-500 font-black">Commander</span></h1>
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold">Digital Twin Interface v2.0</p>
        </header>

        <section className="flex-1 overflow-y-auto pointer-events-auto flex flex-col gap-3 custom-scrollbar pr-2">
          {printerList.map((p) => (
            <div
              key={p.id}
              className={`group p-4 rounded-xl border transition-all duration-300 cursor-pointer ${activePrinterId === p.id
                  ? 'bg-amber-500/20 border-amber-500/50 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-900/40 backdrop-blur-md border-white/5 hover:border-white/20'
                }`}
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-black text-slate-400 group-hover:text-amber-500 transition-colors">#{String(p.id).padStart(3, '0')}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${p.mode === 'stream' ? 'bg-cyan-500 text-slate-900 animate-pulse' :
                    p.status.isPrinting ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400'
                  }`}>
                  {p.mode === 'stream' ? 'MQTT: LIVE' : (p.status.isPrinting ? 'Executing' : 'Idle')}
                </span>

              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 text-[10px] text-slate-300">
                  <Thermometer size={12} className="text-amber-500" />
                  <span>{p.temp.nozzle.toFixed(0)}°C</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-300">
                  <Box size={12} className="text-amber-500" />
                  <span>Layer {p.layer}</span>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* 3. Detailed Telemetry Overlay (Conditional) */}
      {activePrinter && (
        <div className="absolute top-6 right-6 w-96 pointer-events-none">
          <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-2xl border border-amber-500/30 p-6 rounded-3xl shadow-2xl animate-in fade-in slide-in-from-right-10 duration-500">
            <h2 className="text-sm font-black uppercase tracking-widest text-amber-500 mb-6 flex items-center gap-2">
              <Activity size={16} /> Precision Telemetry
            </h2>

            <div className="space-y-6">
              {/* Coordinates */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter block mb-2">Axes Position (MM)</label>
                <div className="grid grid-cols-3 gap-2">
                  {['X', 'Y', 'Z'].map(axis => (
                    <div key={axis} className="bg-slate-950/50 p-2 rounded-lg border border-white/5 text-center">
                      <span className="block text-[8px] text-slate-500 font-black">{axis}</span>
                      <span className="text-sm font-mono font-bold text-amber-500">
                        {activePrinter.pos[axis.toLowerCase()].toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Progress */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter block">Execution Buffer</label>
                  <span className="text-[10px] font-mono text-amber-500">{(activePrinter.layer * 5).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, activePrinter.layer * 5)}%` }}
                  />
                </div>
              </div>

              {/* Hardware Stats */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Bed Temp</span>
                  <span className="text-lg font-bold">{activePrinter.temp.bed.toFixed(1)}°C</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Homed</span>
                  <span className={`text-xs font-black uppercase ${activePrinter.status.isHomed ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {activePrinter.status.isHomed ? 'Verified' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bottom Quick-Actions */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-3 bg-slate-900/40 backdrop-blur-md border border-white/5 p-2 rounded-2xl">
        <button className="px-6 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-widest hover:bg-white transition-all shadow-xl shadow-amber-500/20 active:scale-95">
          Deploy New Variant
        </button>
        <div className="w-px h-6 bg-white/10 mx-2" />
        <button className="p-2 rounded-xl hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
          <Cpu size={20} />
        </button>
      </div>
    </div>
  );
};

export default App;
