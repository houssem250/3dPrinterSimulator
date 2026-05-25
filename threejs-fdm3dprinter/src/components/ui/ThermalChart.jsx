import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

/**
 * High-performance thermal chart using uPlot.
 * Renders nozzle/bed actual + target temperatures directly on canvas,
 * completely bypassing React's render cycle for data updates.
 */
export function ThermalChart({ history = [] }) {
  const wrapperRef = useRef(null);   // sized div that fills the parent
  const mountRef = useRef(null);   // uPlot mounts here
  const chartRef = useRef(null);

  // Build the uPlot column-oriented data array from history prop
  const buildData = (hist) => {
    if (!hist.length) return [[], [], [], [], [], []];
    return [
      hist.map(h => h.time / 1000),            // x  – seconds (uPlot default)
      hist.map(h => h.nozzle ?? null),   // series 1
      hist.map(h => h.bed ?? null),   // series 2
      hist.map(h => h.heatsink ?? null),   // series 3
      hist.map(h => h.nozzleTarget ?? null),   // series 4
      hist.map(h => h.bedTarget ?? null),   // series 5
    ];
  };

  // Build opts using the current real container size
  const buildOpts = (w, h) => ({
    width: w,
    height: h,
    cursor: {
      show: true,
      drag: { x: false, y: false },
      focus: { prox: 16 },
    },
    legend: { show: false },
    padding: [6, 4, 12, 0],
    axes: [
      // X axis – hidden (we rely on the legend overlay below)
      {
        show: false,
        gap: 0,
        space: 30,
      },
      // Y axis
      {
        stroke: '#444',
        grid: { stroke: 'rgba(255,255,255,0.05)', width: 1 },
        ticks: { stroke: '#2a2a2a', width: 1, size: 4 },
        font: '10px Inter, ui-monospace, monospace',
        labelFont: '10px Inter, ui-monospace, monospace',
        values: (_u, vals) => vals.map(v => v == null ? '' : `${Math.round(v)}`),
        size: 34,
        gap: 4,
      },
    ],
    scales: {
      x: { time: true },
      y: { range: [0, 310] },
    },
    series: [
      {},  // x
      // Nozzle actual
      {
        label: 'Nozzle',
        stroke: '#FF6B6B',
        fill: 'rgba(255,107,107,0.12)',
        width: 1.5,
        points: { show: false },
      },
      // Bed actual
      {
        label: 'Bed',
        stroke: '#4D96FF',
        fill: 'rgba(77,150,255,0.12)',
        width: 1.5,
        points: { show: false },
      },
      // Heatsink estimate
      {
        label: 'Heatsink',
        stroke: '#FFD93D',
        fill: 'rgba(255,217,61,0.06)',
        width: 1,
        points: { show: false },
      },
      // Nozzle target – dashed
      {
        label: 'N.Tgt',
        stroke: 'rgba(255,107,107,0.45)',
        width: 1,
        dash: [4, 4],
        points: { show: false },
      },
      // Bed target – dashed
      {
        label: 'B.Tgt',
        stroke: 'rgba(77,150,255,0.45)',
        width: 1,
        dash: [4, 4],
        points: { show: false },
      },
    ],
  });

  // Create the chart once the DOM is ready
  useEffect(() => {
    if (!wrapperRef.current || !mountRef.current) return;

    const w = wrapperRef.current.offsetWidth || 260;
    // const h = wrapperRef.current.offsetHeight || 140;
    const h = 140;

    chartRef.current = new uPlot(buildOpts(w, h), buildData([]), mountRef.current);

    // Keep the canvas in sync with the container's size
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
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);  // intentionally empty – chart instance is long-lived

  // Push new data to the canvas without touching React state
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setData(buildData(history));
    }
  }, [history]);

  return (
    /* wrapperRef fills 100% of whatever HealthRail gives us */
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '120px',
      }}
    >
      {/* uPlot injects its canvas into this div */}
      <div
        ref={mountRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
        }}
      />

      {/* Legend overlay – sits above the chart */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 6,
          display: 'flex',
          gap: '8px',
          fontSize: '8px',
          letterSpacing: '0.03em',
          pointerEvents: 'none',
          zIndex: 2,
          opacity: 0.75,
          userSelect: 'none'
        }}
      >
        <span style={{ color: '#FF6B6B' }}>● Nozzle</span>
        <span style={{ color: '#4D96FF' }}>● Bed</span>
        <span style={{ color: '#FFD93D' }}>● Heatsink</span>
        <span style={{ color: 'rgba(255,107,107,0.7)' }}>╌ N.Tgt</span>
        <span style={{ color: 'rgba(77,150,255,0.7)' }}>╌ B.Tgt</span>
      </div>
    </div>
  );
}
