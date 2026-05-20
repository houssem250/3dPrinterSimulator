import React from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';

export function TopBar() {
  const { 
    uiModals, 
    toggleModal, 
    printerStatus, 
    setPrinterStatus, 
    activePrinterId,
    addLogEntry 
  } = useFleetStore();

  const handleStatusChange = async (newStatus) => {
    setPrinterStatus(newStatus);
    addLogEntry(`SYSTEM: Transitioning to [${newStatus.toUpperCase()}] mode...`, "SYS");
    
    if (newStatus === 'standalone' || newStatus === 'disconnected') {
      const { AppContext } = await import('../../../app_context.js');
      const printer = AppContext.farm.printers.find(p => p.id === activePrinterId);
      if (printer) {
        await printer.switchMode(newStatus);
      }
    }
    
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
        <div className={`status-menu-container ${activePrinterId === null ? 'disabled' : ''}`}>
          <div 
            className="status-trigger" 
            onClick={() => activePrinterId !== null && toggleModal('statusOptions')}
            style={{ opacity: activePrinterId === null ? 0.5 : 1, cursor: activePrinterId === null ? 'not-allowed' : 'pointer' }}
          >
            <span className={`status-text ${getStatusClass()}`}>
              {activePrinterId === null ? "NO PRINTER" : printerStatus.toUpperCase()}
            </span>
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


