import React from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';

export function TopBar() {
  const { uiModals, toggleModal, isFleetInitialized } = useFleetStore();

  return (
    <header className="top-bar">
      <div className="breadcrumb">Constantine Network &gt; Line 04 / Group B &gt; Mach 01</div>
      
      <div className="status-menu-container">
        <div className="status-trigger" onClick={() => toggleModal('statusOptions')}>
          Digital Twin: <span className={`status-text ${isFleetInitialized ? 'green' : 'amber'}`}>
            {isFleetInitialized ? 'CONNECTED' : 'STANDALONE'}
          </span> ▾
        </div>
        
        {uiModals.statusOptions && (
          <ul className="status-dropdown" style={{ display: 'block' }}>
            <li onClick={() => toggleModal('statusOptions', false)}>Disconnect</li>
            <li onClick={() => {
              toggleModal('statusOptions', false);
              toggleModal('configPane', true);
            }}>Configure Connection...</li>
            <li onClick={() => toggleModal('statusOptions', false)}>Standalone Mode</li>
          </ul>
        )}
      </div>

      {uiModals.configPane && (
        <div className="floating-pane config-modal" style={{ display: 'block' }}>
          <div className="pane-header">
            CONNECT TO OCTOPRINT 
            <span className="close-x-btn" onClick={() => toggleModal('configPane', false)}>×</span>
          </div>
          
          <div className="config-body">
            <label>Client Instance IP</label>
            <input type="text" defaultValue="192.168.1.42" />
            
            <label>API Key</label>
            <input type="password" defaultValue="••••••••••••••••" />
            
            <div className="test-idle">Awaiting parameters...</div>
            
            <div className="modal-footer">
              <button className="secondary-btn" onClick={() => toggleModal('configPane', false)}>Cancel</button>
              <button className="action-btn" onClick={() => toggleModal('configPane', false)}>Establish Connection</button>
            </div>
          </div>
        </div>
      )}
      
      <div className="user-meta">Service Manager: houssem250 | <span className="text-[var(--text-dim)] uppercase tracking-wider">Technician View</span></div>
    </header>
  );
}
