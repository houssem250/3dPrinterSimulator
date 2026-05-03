import React, { useState } from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';

export function FleetSidebar() {
  const { fleetGroups, toggleGroup, uiModals, toggleModal } = useFleetStore();
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <aside className="left-sidebar">
      <nav className="icon-rail">
        <div className="nav-icon active">⬢</div>
        <div className="nav-icon">⚀</div>
        <div className="nav-icon">⚙</div>
      </nav>
      
      <section className="pane fleet-manager">
        <div className="pane-header relative">
          FLEET NAVIGATION 
          <span 
            className="add-btn" 
            title="Add Group or Asset"
            onClick={() => toggleModal('globalAddMenu')}
          >+</span>
          
          {uiModals.globalAddMenu && (
            <ul className="status-dropdown" style={{ display: 'block', position: 'absolute', top: '100%', right: '0', zIndex: 1001 }}>
              <li onClick={() => {
                toggleModal('globalAddMenu', false);
                toggleModal('assetWizard', true);
              }}>+ New Asset</li>
              <li onClick={() => toggleModal('globalAddMenu', false)}>+ New Group</li>
            </ul>
          )}
        </div>
        
        <div className="search-box mb-3">
          <input 
            type="text" 
            placeholder="Search nodes..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black border border-[var(--border)] text-white px-3 py-1.5 text-xs rounded"
          />
        </div>
        
        <div className="tree-container overflow-y-auto pr-1 pb-4">
          {fleetGroups.map((group) => (
            <div key={group.id} className="group-wrapper mb-1">
              <div 
                className={`group-node ${group.isOpen ? 'open' : ''}`}
                onClick={() => toggleGroup(group.id)}
              >
                <span className="uppercase">{group.groupName}</span>
                <div className="flex items-center">
                  <span 
                    className="add-btn-quick px-1" 
                    title="Quick Add Asset"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleModal('assetWizard', true);
                    }}
                  >+</span>
                  {group.canDelete && (
                    <span className="action-icon text-[var(--accent-red)] ml-2">🗑</span>
                  )}
                </div>
              </div>
              
              {group.isOpen && (
                <ul className="asset-list block">
                  {group.assets.length === 0 ? (
                    <li className="tree-node empty-msg opacity-50 italic pl-5">Empty Group</li>
                  ) : (
                    group.assets
                      .filter(asset => asset.name.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((asset) => (
                        <li key={asset.id} className="tree-node cursor-pointer group">
                          <span className="asset-label flex-1 truncate text-[#ccc]">
                            <span className="status-dot active text-[var(--accent-green)] mr-2">●</span>
                            {asset.name}
                          </span>
                          <div className="asset-actions flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="three-dots">⋮</span>
                          </div>
                        </li>
                      ))
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {uiModals.assetWizard && (
        <div className="floating-pane config-modal" style={{ display: 'block', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '320px' }}>
          <div className="pane-header">
            NEW ASSET CONFIGURATION
            <span className="close-x-btn" onClick={() => toggleModal('assetWizard', false)}>×</span>
          </div>

          <nav className="wizard-tabs">
            <div className="tab-btn active w-1/2 border-b-2 border-[var(--accent-green)] text-[var(--accent-green)] pb-2 text-center uppercase text-[10px] cursor-pointer">Printer</div>
            <div className="tab-btn w-1/2 border-b-2 border-transparent pb-2 text-center uppercase text-[10px] cursor-pointer">Filament</div>
          </nav>

          <div className="wizard-content mt-4">
            <div className="tab-pane active block">
              <div className="config-body scrollable">
                <label className="block text-[10px] text-[var(--text-dim)] mt-2">Printer ID</label>
                <input type="text" placeholder="PRINTER_01" className="w-full bg-black border border-[var(--border)] text-white p-1 mb-2" /> 
                
                <label className="block text-[10px] text-[var(--text-dim)] mt-2">Model</label>
                <input type="text" placeholder="BCN3D+ Custom" className="w-full bg-black border border-[var(--border)] text-white p-1 mb-2" />
                
                <div className="input-row flex gap-2">
                  <div className="flex-1"><label className="block text-[10px] text-[var(--text-dim)]">Build X</label><input type="number" defaultValue="200" className="w-full bg-black border border-[var(--border)] text-white p-1" /></div>
                  <div className="flex-1"><label className="block text-[10px] text-[var(--text-dim)]">Build Y</label><input type="number" defaultValue="200" className="w-full bg-black border border-[var(--border)] text-white p-1" /></div>
                  <div className="flex-1"><label className="block text-[10px] text-[var(--text-dim)]">Build Z</label><input type="number" defaultValue="200" className="w-full bg-black border border-[var(--border)] text-white p-1" /></div>
                </div>
              </div>
              <div className="modal-footer flex gap-2 mt-4">
                <button className="action-btn flex-1 bg-[var(--accent-green)] text-black font-bold p-2 text-xs uppercase" onClick={() => toggleModal('assetWizard', false)}>Add Asset</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
