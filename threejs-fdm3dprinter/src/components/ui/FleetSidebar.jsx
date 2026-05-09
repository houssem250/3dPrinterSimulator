import React, { useState } from 'react';
import { useFleetStore } from '../../store/useFleetStore.js';

export function FleetSidebar() {
  const { 
    paneStates, 
    togglePane, 
    fleetGroups, 
    printers,
    activePrinterId,
    toggleGroup, 
    uiModals, 
    toggleModal,
    activeControlAssetId,
    setControlAsset,
    addLogEntry,
    addGroup,
    deleteGroup,
    setTargetWizardGroupId,
    moveAsset,
    updateActiveJob,
    setSelectedAssetForReconfig,
    deleteAsset,
    setActivePrinter
  } = useFleetStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [controlTab, setControlTab] = useState('print');
  const [openContextMenuId, setOpenContextMenuId] = useState(null);

  const filteredGroups = fleetGroups.map(group => ({
    ...group,
    assets: group.assets.filter(asset => 
      asset.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(group => group.assets.length > 0 || group.groupName.toLowerCase().includes(searchTerm.toLowerCase()));

  // Find active control asset
  let activeAsset = null;
  if (activeControlAssetId !== null) {
    for (const g of fleetGroups) {
      const asset = g.assets.find(a => a.id === activeControlAssetId);
      if (asset) {
        activeAsset = asset;
        break;
      }
    }
  }

  const handleAssetDoubleClick = (id) => {
    setControlAsset(id);
    setActivePrinter(id);
    addLogEntry(`Accessing Control Interface for node [${id}]`, "SYS");
  };

  const handleAddGroup = () => {
    const name = prompt("Enter New Group Name:");
    if (name) {
      addGroup(name);
      addLogEntry(`Created new group [${name}]`, "SYS");
      toggleModal('globalAddMenu', false);
    }
  };

  const handleQuickAdd = (e, groupId) => {
    e.stopPropagation();
    setTargetWizardGroupId(groupId);
    toggleModal('assetWizard', true);
  };

  const toggleContextMenu = (e, id) => {
    e.stopPropagation();
    setOpenContextMenuId(openContextMenuId === id ? null : id);
  };

  // Derive activeJob from the currently focused printer
  const currentPrinter = activePrinterId !== null ? printers[activePrinterId] : null;
  
  const activeJob = {
    fileName: currentPrinter?.fileName || "No file selected",
    progress: currentPrinter?.progress || 0,
    isPrinting: !!currentPrinter?.isPrinting,
    isPaused: !!currentPrinter?.isPaused,
    lines: currentPrinter?.lines || "---",
    moves: currentPrinter?.moves || "---",
    skipped: currentPrinter?.skipped || "---",
    layers: currentPrinter?.layers || "---",
    htemp: currentPrinter?.htemp || "---",
    btemp: currentPrinter?.btemp || "---",
    filament: currentPrinter?.filament || "---",
    kfactor: currentPrinter?.kfactor || "---"
  };

  const handleStartPrint = () => {
    const { updateActiveJob, setPrintCommand, addLogEntry } = useFleetStore.getState();
    if (activeJob.fileName === "No file selected") {
      addLogEntry("ERROR: Cannot start - no file loaded.", "SYS");
      return;
    }
    
    setPrintCommand('start');
    updateActiveJob({ isPrinting: true, isPaused: false });
    addLogEntry(`COMMAND: START_PRINT for ${activeJob.fileName} initiated.`, "SYS");
  };

  const handlePausePrint = () => {
    const { updateActiveJob, setPrintCommand, addLogEntry } = useFleetStore.getState();
    if (!activeJob.isPrinting) return;

    const newPausedState = !activeJob.isPaused;
    const action = newPausedState ? 'pause' : 'resume';
    
    setPrintCommand(action);
    updateActiveJob({ isPaused: newPausedState });
    addLogEntry(`COMMAND: ${action.toUpperCase()}_PRINT requested.`, "SYS");
  };

  const handleAbortPrint = () => {
    const { updateActiveJob, setPrintCommand, addLogEntry } = useFleetStore.getState();
    setPrintCommand('abort');
    updateActiveJob({ isPrinting: false, isPaused: false, progress: 0 });
    addLogEntry("COMMAND: ABORT_PRINT - cutting power.", "SYS");
  };

  const handleApplyPreset = (e) => {
    const select = e.target.previousSibling.querySelector('select');
    const [nozzle, bed] = select.value.split(',');
    addLogEntry(`Thermal Preset Applied: ${nozzle}°C / ${bed}°C`, "current");
    updateActiveJob({ htemp: nozzle + " °C", btemp: bed + " °C" });
  };

  return (
    <aside className={`left-sidebar ${!paneStates.left ? 'collapsed' : ''}`} onClick={() => setOpenContextMenuId(null)}>
      <button className="pane-toggle-btn" id="toggle-left" onClick={() => togglePane('left')}>
        {paneStates.left ? '◀' : '▶'}
      </button>
      
      <nav className="icon-rail">
        <div className="nav-icon active">⬢</div>
        <div className="nav-icon" id="rail-printer-icon">⎙</div>
        <div className="nav-icon">⚀</div>
        <div className="nav-icon">⚙</div>
      </nav>

      {activeControlAssetId === null ? (
        <section className="pane fleet-manager">
          <div className="pane-header" style={{ position: 'relative' }}>
            FLEET NAVIGATION 
            <span 
              className="add-btn" 
              id="global-add-fleet"
              title="Add Group or Asset"
              onClick={(e) => {
                e.stopPropagation();
                toggleModal('globalAddMenu');
              }}
            >+</span>
            
            {uiModals.globalAddMenu && (
              <ul className="status-dropdown" id="global-add-menu" style={{ display: 'block', position: 'absolute', top: '35px', right: 0, width: '140px', zIndex: 100 }}>
                <li onClick={() => {
                  setTargetWizardGroupId("unassigned");
                  toggleModal('globalAddMenu', false);
                  toggleModal('assetWizard', true);
                }}>+ New Asset</li>
                <li onClick={handleAddGroup}>+ New Group</li>
              </ul>
            )}
          </div>

          <div className="search-box">
            <input 
              type="text" 
              placeholder=" Search nodes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="tree-container" id="fleet-tree">
            {filteredGroups.map((group) => (
              <div key={group.id} className="group-wrapper">
                <div 
                  className={`group-node ${group.isOpen ? 'open' : ''}`}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span>{group.groupName.toUpperCase()}</span>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="add-btn-quick" title="Quick Add Asset" onClick={(e) => handleQuickAdd(e, group.id)}>+</span>
                    {group.canDelete && <span className="action-icon" style={{ marginLeft: '10px', color: 'var(--accent-red)' }} onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }}>🗑</span>}
                  </div>
                </div>
                
                {group.isOpen && (
                  <ul className="asset-list">
                    {group.assets.length === 0 ? (
                      <li className="tree-node empty-msg" style={{ opacity: 0.5, fontStyle: 'italic', paddingLeft: '20px' }}>Empty Group</li>
                    ) : (
                      group.assets.map((asset) => (
                        <li 
                          key={asset.id} 
                          className="tree-node"
                          onDoubleClick={() => handleAssetDoubleClick(asset.id)}
                        >
                          <span className="asset-label">
                            <span className="status-dot green">●</span>
                            {asset.name}
                          </span>
                          <div className="asset-actions" style={{ visibility: 'visible', opacity: 1 }}>
                            <span className="three-dots" onClick={(e) => toggleContextMenu(e, asset.id)}>⋮</span>
                            {openContextMenuId === asset.id && (
                              <ul className="asset-context-menu" style={{ display: 'block' }}>
                                <li onClick={() => { useFleetStore.getState().setActivePrinter(asset.id); setOpenContextMenuId(null); }}>🔍 Focus 3D View</li>
                                <li onClick={() => handleAssetDoubleClick(asset.id)}>▶ Start Control</li>
                                <li onClick={() => { setSelectedAssetForReconfig(asset); setTargetWizardGroupId(group.id); toggleModal('assetWizard', true); }}>⚙ Reconfigure</li>
                                <li onClick={() => { moveAsset(asset.id, "unassigned"); setOpenContextMenuId(null); }}>📤 Move to Unassigned</li>
                                <li style={{ color: 'var(--accent-red)' }} onClick={() => deleteAsset(group.id, asset.id)}>✕ Delete Asset</li>
                              </ul>
                            )}
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

      ) : (
        <section className="pane fleet-manager">
          <div className="pane-header">
            <span>CONTROL: {activeAsset?.name}</span>
            <span className="close-x-btn" onClick={() => setControlAsset(null)}>×</span>
          </div>
          
          <div className="control-tabs">
            <div 
              className={`tab ${controlTab === 'print' ? 'active' : ''}`} 
              onClick={() => setControlTab('print')}
            >PRINTING</div>
            <div 
              className={`tab ${controlTab === 'calib' ? 'active' : ''}`} 
              onClick={() => setControlTab('calib')}
            >CALIBRATION</div>
          </div>

          <div className="print-control-body">
            {controlTab === 'print' ? (
              <div id="tab-print" className="tab-content active" style={{ display: 'block' }}>
                <div className="job-status-card">
                  <label style={{ fontSize: '9px', color: 'var(--text-dim)' }}>ACTIVE FILE</label>
                  <div id="active-filename" style={{ fontSize: '12px', margin: '5px 0', color: 'var(--accent-green)', fontWeight: 'bold' }}>{activeJob.fileName}</div>
                  <div className="progress-bar-container">
                    <div id="print-progress-fill" className="progress-fill" style={{ width: `${activeJob.progress}%` }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span>{activeJob.progress}%</span>
                    <span>Est: --:--</span>
                  </div>
                </div>

                <div className="control-grid">
                  <button className="action-btn btn-start" onClick={handleStartPrint}>START</button>
                  <button className="secondary-btn" onClick={handlePausePrint}>
                    {activeJob.isPaused ? "CONTINUE" : "PAUSE"}
                  </button>
                  <button className="secondary-btn" onClick={() => document.getElementById('global-file-input').click()}>UPLOAD</button>
                  <button className="action-btn btn-abort" onClick={handleAbortPrint}>ABORT</button>
                </div>
                
                <div className="file-metadata-pane">
                  <div className="meta-row"><span>Total lines:</span> <span>{activeJob.lines}</span></div>
                  <div className="meta-row"><span>Parsed moves:</span> <span>{activeJob.moves}</span></div>
                  <div className="meta-row"><span>Skipped lines:</span> <span>{activeJob.skipped}</span></div>
                  <div className="meta-row"><span>Layers:</span> <span>{activeJob.layers}</span></div>
                  <div className="meta-row"><span>Hotend temp:</span> <span>{activeJob.htemp}</span></div>
                  <div className="meta-row"><span>Bed temp:</span> <span>{activeJob.btemp}</span></div>
                  <div className="meta-row"><span>Est. filament:</span> <span>{activeJob.filament}</span></div>
                  <div className="meta-row"><span>Linear advance:</span> <span>{activeJob.kfactor}</span></div>
                </div>

                <div className="temp-control-section">
                  <div className="temp-section-title">Thermal Management</div>
                  <div className="preset-group">
                    <div className="temp-input-wrapper">
                      <label>Material Presets</label>
                      <select className="industrial-select">
                        <option value="200,60">PLA (200°C / 60°C)</option>
                        <option value="240,100">ABS (240°C / 100°C)</option>
                        <option value="230,80">PETG (230°C / 80°C)</option>
                        <option value="215,60">TPU (215°C / 60°C)</option>
                      </select>
                    </div>
                    <button className="btn-set" onClick={handleApplyPreset}>SET ALL</button>
                  </div>
                  
                  <div className="manual-temp-group" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <div className="temp-input-wrapper">
                      <label>Nozzle (°C)</label>
                      <input type="number" className="industrial-input" placeholder="200" style={{ width: '100%' }} />
                    </div>
                    <button className="btn-set" style={{ height: '32px', alignSelf: 'flex-end' }} onClick={(e) => {
                      const val = e.target.previousSibling.querySelector('input').value;
                      if(val) { addLogEntry(`Manual nozzle set to ${val}°C`, "current"); updateActiveJob({ htemp: val + " °C" }); }
                    }}>SET</button>
                  </div>
                  <div className="manual-temp-group" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <div className="temp-input-wrapper">
                      <label>Bed (°C)</label>
                      <input type="number" className="industrial-input" placeholder="60" style={{ width: '100%' }} />
                    </div>
                    <button className="btn-set" style={{ height: '32px', alignSelf: 'flex-end' }} onClick={(e) => {
                      const val = e.target.previousSibling.querySelector('input').value;
                      if(val) { addLogEntry(`Manual bed set to ${val}°C`, "current"); updateActiveJob({ btemp: val + " °C" }); }
                    }}>SET</button>
                  </div>
                </div>
              </div>
            ) : (
              <div id="tab-calib" className="tab-content active" style={{ display: 'block' }}>
                <div className="calibration-info">
                  <p>System health check. Verify hardware integrity before production.</p>
                </div>
                <div className="calibration-options">
                  <label className="check-container select-all">
                    <input type="checkbox" onChange={(e) => {
                      document.querySelectorAll('.cal-opt').forEach(cb => cb.checked = e.target.checked);
                      document.getElementById('cal-time-val').innerText = e.target.checked ? "12m 30s" : "0m";
                    }} />
                    <span className="checkmark"></span> SELECT ALL MODULES
                  </label>
                  <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '10px 0' }} />
                  <label className="check-container">
                    <input type="checkbox" className="cal-opt" />
                    <span className="checkmark"></span> Extrusion Test (E-Steps)
                  </label>
                  <label className="check-container">
                    <input type="checkbox" className="cal-opt" />
                    <span className="checkmark"></span> Movement (X/Y/Z Squaring)
                  </label>
                  <label className="check-container">
                    <input type="checkbox" className="cal-opt" />
                    <span className="checkmark"></span> Thermal Stability (PID)
                  </label>
                </div>
                <div className="calib-footer" style={{ marginTop: '20px' }}>
                  <div className="est-time">Est. Duration: <span id="cal-time-val">0m</span></div>
                  <button className="action-btn" style={{ width: '100%', marginTop: '10px' }} onClick={() => addLogEntry("SYSTEM: Initiating hardware calibration sequence...", "SYS")}>START TEST</button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </aside>
  );
}
