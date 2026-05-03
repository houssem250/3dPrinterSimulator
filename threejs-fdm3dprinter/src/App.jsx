import React from 'react';
import { TopBar } from './components/ui/TopBar.jsx';
import { FleetSidebar } from './components/ui/FleetSidebar.jsx';
import { HealthRail } from './components/ui/HealthRail.jsx';
import { MainViewport } from './components/ui/MainViewport.jsx';

/**
 * Main Application Component
 * 
 * Re-architected with CSS Grid Layout (dashboard-grid)
 * separating TopBar, Sidebars, and the 3D MainViewport.
 */
const App = () => {
  return (
    <div className="dashboard-grid">
      <TopBar />
      <FleetSidebar />
      <MainViewport />
      <HealthRail />
      
      <footer className="system-footer bg-black border-t border-[var(--border)] flex justify-between items-center px-4 text-[10px] text-[var(--text-dim)]" style={{ gridArea: 'footer' }}>
        <div className="footer-btn cursor-pointer hover:text-white transition-colors">App Settings (Ctrl + .)</div>
        <div className="load-metrics">CPU/GPU: 0.8%</div>
        <div className="uptime">Network Uptime: 99.99%</div>
      </footer>
    </div>
  );
};

export default App;

