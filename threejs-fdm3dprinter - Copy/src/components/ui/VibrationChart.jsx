import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

/**
 * VibrationChart
 * High-performance IMU vibration chart using uPlot.
 *
 * Series:
 *   1. Vibration Magnitude  √(Δacc_x² + Δacc_y² + Δacc_z²)  — orange
 *   2. Raw acc_z baseline                                       — dim grey
 *   3. Threshold reference line (static 500 LSB)               — red dashed
 *
 * Receives a rolling 30-second `history` array:
 *   [{ time: number(ms), magnitude: number, acc_z: number }, ...]
 */
export function VibrationChart({ history = [] }) {
  const wrapperRef = useRef(null);
  const mountRef  = useRef(null);
  const chartRef  = useRef(null);
  const valMagRef = useRef(null);

  /** Map history array → uPlot column-oriented data */
  const buildData = (hist) => {
    if (!hist.length) return [[], [], [], [], []];
    const xs   = hist.map(h => h.time / 1000);
    const mags = hist.map(h => h.magnitude ?? null);   // mean
    const peaks = hist.map(h => h.peak ?? h.magnitude ?? null); // peak
    const azs  = hist.map(h => h.acc_z ?? null);
    const thr  = hist.map(() => 500);                  // threshold line
    return [xs, mags, peaks, azs, thr];
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
          if (dataIdx != null && valMagRef.current) {
            const mean = u.data[1][dataIdx];
            const peak = u.data[2][dataIdx];
            if (mean != null) {
              const isAnom = (peak ?? mean) > 500;
              valMagRef.current.textContent = `${isAnom ? '⚠ ' : ''}μ${Math.round(mean)} pk${Math.round(peak ?? mean)} LSB`;
              valMagRef.current.style.color = isAnom ? '#FF6B6B' : 'var(--text-dim, #888)';
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
        values: (_u, vals) => vals.map(v => v == null ? '' : Math.round(v).toString()),
        size: 38,
        gap: 4,
      },
    ],
    scales: {
      x: { time: true },
      y: { range: (u, min, max) => [0, Math.max(600, max + 50)] },
    },
    series: [
      {}, // x
      // Mean magnitude (smooth trend)
      {
        label:  'Mean',
        stroke: '#FF9F43',
        fill:   'rgba(255,159,67,0.10)',
        width:  1.5,
        points: { show: false },
      },
      // Peak magnitude (anomaly spikes)
      {
        label:  'Peak',
        stroke: 'rgba(255,80,150,0.85)',
        width:  1,
        dash:   [2, 3],
        points: { show: false },
      },
      // Raw acc_z baseline (noise floor)
      {
        label:  'acc_z',
        stroke: 'rgba(180,180,180,0.25)',
        width:  1,
        points: { show: false },
      },
      // 500 LSB threshold reference
      {
        label:  'Threshold',
        stroke: 'rgba(255,80,80,0.6)',
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

  const latestEntry = history.length > 0 ? history[history.length - 1] : null;
  const latestMag   = latestEntry ? Math.round(latestEntry.magnitude) : null;
  const latestPeak  = latestEntry ? Math.round(latestEntry.peak ?? latestEntry.magnitude) : null;
  const isAnomalous = latestPeak !== null && latestPeak > 500;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: '120px' }}>
      {/* uPlot canvas mount */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, background: 'transparent', opacity: history.length === 0 ? 0 : 1 }} />

      {/* Empty State Overlay */}
      {history.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-dim, #666)', fontSize: '10px', letterSpacing: '1px', fontFamily: 'var(--font-mono)'
        }}>
          — SENSOR OFFLINE —
        </div>
      )}

      {/* Legend overlay */}
      <div style={{
        position: 'absolute', top: 4, right: 6,
        display: 'flex', gap: '8px',
        fontSize: '8px', letterSpacing: '0.03em',
        pointerEvents: 'none', zIndex: 2, opacity: 0.75, userSelect: 'none'
      }}>
        <span style={{ color: '#FF9F43' }}>μ Mean</span>
        <span style={{ color: 'rgba(255,80,150,0.9)' }}>┈ Peak</span>
        <span style={{ color: 'rgba(255,80,80,0.8)' }}>┈ 500 LSB</span>
      </div>

      {/* Live magnitude badge */}
      <div ref={valMagRef} style={{
        position: 'absolute', bottom: 14, right: 6,
        fontSize: '9px', fontFamily: 'var(--font-mono, monospace)',
        color: isAnomalous ? '#FF6B6B' : 'var(--text-dim, #888)',
        background: 'rgba(0,0,0,0.4)',
        padding: '1px 4px', borderRadius: '3px',
        pointerEvents: 'none', zIndex: 2,
        transition: 'color 0.3s',
        display: history.length > 0 ? 'block' : 'none'
      }}>
        {isAnomalous ? '⚠ ' : ''}μ{latestMag} pk{latestPeak} LSB
      </div>
    </div>
  );
}
