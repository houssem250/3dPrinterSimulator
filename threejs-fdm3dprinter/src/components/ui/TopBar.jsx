import React from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';

export function TopBar() {
  const { uiModals, toggleModal, printerStatus, setPrinterStatus, addLogEntry } = useFleetStore();

  const handleStatusChange = (newStatus) => {
    setPrinterStatus(newStatus);
    addLogEntry(`Octoprint status transitioned to [${newStatus.toUpperCase()}]`, "SYS");
    toggleModal('statusOptions', false);
  };

  const getStatusClass = () => {
    if (printerStatus === 'connected') return 'status-green';
    if (printerStatus === 'standalone') return 'status-amber';
    return 'status-red';
  };

  return (
    <header className="top-bar">
      <div className="system-logo">ANTIGRAVITY // <span>3D_FLEET</span></div>
      
      <div className="header-nav-center">
        <button 
          className="overview-btn" 
          onClick={() => {
            useFleetStore.getState().focusOverview();
            addLogEntry("Camera transitioning to Site-Wide Overview", "SYS");
          }}
          title="World Overview"
        >
          <span style={{ marginRight: '8px' }}>⬢</span> OVERVIEW
        </button>
      </div>

      <div className="header-actions">
        <div className="status-menu-container">
          <div className="status-trigger" onClick={() => toggleModal('statusOptions')}>
            <span className={`status-text ${getStatusClass()}`}>{printerStatus.toUpperCase()}</span>
          </div>
          
          {uiModals.statusOptions && (
            <ul className="status-dropdown" style={{ display: 'block' }}>
              <li onClick={() => handleStatusChange('standalone')}>● STANDALONE MODE</li>
              <li onClick={() => handleStatusChange('disconnected')}>● DISCONNECT SYSTEM</li>
              <hr />
              <li onClick={() => {
                toggleModal('statusOptions', false);
                toggleModal('configPane', true);
              }}>⚙ CONFIGURE CONNECTION</li>
            </ul>
          )}
        </div>
        <div className="user-profile"><span>OP_01</span> <div className="avatar">M</div></div>
      </div>
    </header>
  );
}


