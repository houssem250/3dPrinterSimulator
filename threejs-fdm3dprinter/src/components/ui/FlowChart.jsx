import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

/**
 * FlowChart
 * High-performance filament flow chart using uPlot.
 *
 * Series:
 *   1. flow_mm_s  — measured encoder flow rate             (teal)
 *   2. nominal    — rolling mean of active extrusion        (orange dashed)
 *
 * Receives a `history` array (up to 600 samples):
 *   [{ time: number(ms), flow_mm_s: number, counts: number, cumulativeMm: number }, ...]
 *
 * Overlay: cumulative mm badge (bottom-right)
 */
export function FlowChart({ history = [] }) {
  const wrapperRef = useRef(null);
  const mountRef  = useRef(null);
  const chartRef  = useRef(null);
  const valFlowRef = useRef(null);

  /** Compute a trailing nominal (mean of non-zero flow in the last N samples) */
  const computeNominal = (hist, windowSize = 60) => {
    const slice = hist.slice(-windowSize);
    const active = slice.filter(h => h.flow_mm_s > 0.05);
    if (active.length === 0) return null;
    return active.reduce((s, h) => s + h.flow_mm_s, 0) / active.length;
  };

  const buildData = (hist) => {
    if (!hist.length) return [[], [], []];
    const xs   = hist.map(h => h.time / 1000);
    const flow = hist.map(h => h.flow_mm_s ?? null);
    const nom  = computeNominal(hist);
    const nomLine = hist.map(() => nom);
    return [xs, flow, nomLine];
  };

  const buildOpts = (w, h) => ({
    width:  w,
    height: h,
    cursor: { 
      show: true, drag: { x: false, y: false }, focus: { prox: 16 },
      bind: {
        setCursor: (u) => {
          const idx = u.cursor.idx;
          const dataIdx = idx == null ? (u.data[0].length > 0 ? u.data[0].length - 1 : null) : idx;
          if (dataIdx != null && valFlowRef.current) {
            const flow = u.data[1][dataIdx];
            if (flow != null) {
              const isUnderflow = flow < 0.05;
              valFlowRef.current.textContent = `${isUnderflow ? '⚠ ' : ''}${flow.toFixed(2)} mm/s`;
              valFlowRef.current.style.color = isUnderflow ? '#FF6B6B' : 'var(--text-dim, #888)';
            }
          }
        }
      }
    },
    legend: { show: false },
    padding: [6, 4, 12, 0],
    axes: [
      { show: false, gap: 0, space: 30 },
      {
        stroke: '#444',
        grid:   { stroke: 'rgba(255,255,255,0.05)', width: 1 },
        ticks:  { stroke: '#2a2a2a', width: 1, size: 4 },
        font:   '10px Inter, ui-monospace, monospace',
        values: (_u, vals) => vals.map(v => v == null ? '' : `${v.toFixed(1)}`),
        size: 38,
        gap: 4,
      },
    ],
    scales: {
      x: { time: true },
      y: { range: (u, min, max) => [0, Math.max(10, max + 1)] },
    },
    series: [
      {}, // x
      // Measured flow
      {
        label:  'Flow',
        stroke: '#26de81',
        fill:   'rgba(38,222,129,0.10)',
        width:  1.5,
        points: { show: false },
      },
      // Nominal reference
      {
        label:  'Nominal',
        stroke: 'rgba(255,159,67,0.7)',
        width:  1,
        dash:   [4, 4],
        points: { show: false },
      },
    ],
  });

  // Mount chart once
  useEffect(() => {
    if (!wrapperRef.current || !mountRef.current) return;
    const w = wrapperRef.current.offsetWidth || 260;
    const h = 140;

    chartRef.current = new uPlot(buildOpts(w, h), buildData([]), mountRef.current);

    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      const newW = Math.floor(entry.contentRect.width);
      const newH = Math.floor(entry.contentRect.height);
      if (chartRef.current && newW > 0 && newH > 0) {
        chartRef.current.setSize({ width: newW, height: newH });
      }
    });
    ro.observe(wrapperRef.current);

    return () => {
      ro.disconnect();
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, []);

  // Push new data without React re-renders
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setData(buildData(history));
    }
  }, [history]);

  const latestFlow = history.length > 0 ? history[history.length - 1].flow_mm_s : null;
  const cumulativeMm = history.length > 0 ? history[history.length - 1].cumulativeMm ?? 0 : 0;
  const isUnderflow  = latestFlow !== null && latestFlow < 0.05 && cumulativeMm > 5;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: '120px' }}>
      {/* uPlot canvas mount */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, background: 'transparent' }} />

      {/* Legend overlay */}
      <div style={{
        position: 'absolute', top: 4, right: 6,
        display: 'flex', gap: '8px',
        fontSize: '8px', letterSpacing: '0.03em',
        pointerEvents: 'none', zIndex: 2, opacity: 0.75, userSelect: 'none'
      }}>
        <span style={{ color: '#26de81' }}>● Flow</span>
        <span style={{ color: 'rgba(255,159,67,0.9)' }}>╌ Nominal</span>
      </div>

      {/* Cumulative mm badge */}
      <div style={{
        position: 'absolute', bottom: 14, left: 6,
        fontSize: '9px', fontFamily: 'var(--font-mono, monospace)',
        color: 'rgba(38,222,129,0.7)',
        background: 'rgba(0,0,0,0.4)',
        padding: '1px 4px', borderRadius: '3px',
        pointerEvents: 'none', zIndex: 2,
      }}>
        ∑ {cumulativeMm.toFixed(1)} mm
      </div>

      {/* Live flow badge */}
      <div ref={valFlowRef} style={{
        position: 'absolute', bottom: 14, right: 6,
        fontSize: '9px', fontFamily: 'var(--font-mono, monospace)',
        color: isUnderflow ? '#FF6B6B' : 'var(--text-dim, #888)',
        background: 'rgba(0,0,0,0.4)',
        padding: '1px 4px', borderRadius: '3px',
        pointerEvents: 'none', zIndex: 2,
        transition: 'color 0.3s',
        display: history.length > 0 ? 'block' : 'none'
      }}>
        {isUnderflow ? '⚠ ' : ''}{latestFlow !== null ? latestFlow.toFixed(2) : '0.00'} mm/s
      </div>
    </div>
  );
}
