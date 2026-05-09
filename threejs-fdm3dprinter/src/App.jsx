import React, { useState, useEffect } from 'react';
import { TopBar } from './components/ui/TopBar.jsx';
import { FleetSidebar } from './components/ui/FleetSidebar.jsx';
import { HealthRail } from './components/ui/HealthRail.jsx';
import { MainViewport } from './components/ui/MainViewport.jsx';
import { useFleetStore } from './store/useFleetStore.js';

const App = () => {
  const { 
    uiModals, 
    toggleModal, 
    addLogEntry, 
    addAsset, 
    targetWizardGroupId, 
    setTargetWizardGroupId, 
    setPrinterStatus, 
    fleetGroups,
    selectedAssetForReconfig,
    setSelectedAssetForReconfig,
    updateActiveJob,
    deleteAsset
  } = useFleetStore();

  const [activeWizardTab, setActiveWizardTab] = useState('printer-tab');
  const [wizardData, setWizardData] = useState({ name: '', model: '' });

  // Sync wizardData when reconfiguring
  useEffect(() => {
    if (selectedAssetForReconfig) {
      setWizardData({ name: selectedAssetForReconfig.name, model: selectedAssetForReconfig.model || '' });
    } else {
      setWizardData({ name: '', model: '' });
    }
  }, [selectedAssetForReconfig]);

  // Heartbeat Terminal Logs
  useEffect(() => {
    const gcodes = [
      "G1 X10 Y50 E1.5", 
      "M105 (Heat Check)", 
      "G1 Z30.80 F3000", 
      "M114 (Get Position)", 
      "G92 E0 (Reset Extruder)"
    ];
    const interval = setInterval(() => {
      addLogEntry(gcodes[Math.floor(Math.random() * gcodes.length)], "SYS");
    }, 4000);
    return () => clearInterval(interval);
  }, [addLogEntry]);

  const handleFinishAsset = () => {
    const { setPlacementMode, updateAsset } = useFleetStore.getState();
    const name = wizardData.name || "New Printer";
    
    if (selectedAssetForReconfig) {
      // Edit existing asset: Handle both metadata AND possible group move
      updateAsset(targetWizardGroupId, selectedAssetForReconfig.id, { 
        name, 
        model: wizardData.model 
      });
      
      addLogEntry(`SYSTEM: Reconfigured [${name}] and moved to ${fleetGroups.find(g => g.id === targetWizardGroupId)?.groupName}`, "SYS");
      toggleModal('assetWizard', false);
    } else {
      // NEW ASSET: Enter 3D Placement Mode
      setPlacementMode(true, { name, model: wizardData.model });
      addLogEntry(`SYSTEM: Entering deployment mode for ${name}. Select a slot in the 3D scene.`, "SYS");
      toggleModal('assetWizard', false);
    }
    
    setSelectedAssetForReconfig(null);
    setWizardData({ name: '', model: '' });
  };

  const handleEstablishConnection = () => {
    addLogEntry("SYSTEM: Initiating handshaking with Octoprint instance...", "SYS");
    setTimeout(() => {
      setPrinterStatus('connected');
      addLogEntry("SYSTEM: Octoprint connection established.", "SYS");
      toggleModal('configPane', false);
    }, 1500);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const { activePrinterId } = useFleetStore.getState();
      if (activePrinterId === null) {
        addLogEntry("ERROR: No active printer selected for upload.", "SYS");
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const gcodeText = event.target.result;
        addLogEntry(`SYSTEM: Analyzing ${file.name}...`, "SYS");

        try {
          const { GCodeLoader } = await import('../gcode/gcode_loader.js');
          const loader = new GCodeLoader();
          loader.parse(gcodeText);
          
          // Get the actual PrinterInstance from the global AppContext
          const { AppContext } = await import('../app_context.js');
          const printer = AppContext.farm.printers.find(p => p.id === activePrinterId);
          
          if (printer) {
            printer.standalone.load(loader.moves);
            
            updateActiveJob({
              fileName: file.name,
              progress: 0,
              isPrinting: false,
              lines: loader.stats.totalLines.toLocaleString(),
              moves: loader.stats.parsedMoves.toLocaleString(),
              skipped: loader.stats.skipped.toLocaleString(),
              layers: loader.stats.layers.toLocaleString(),
              htemp: loader.stats.hotendTemp ? `${Math.round(loader.stats.hotendTemp)} °C` : "---",
              btemp: loader.stats.bedTemp ? `${Math.round(loader.stats.bedTemp)} °C` : "---",
              filament: `${loader.stats.estimatedFilament.toFixed(1)} mm`,
              kfactor: loader.stats.linearAdvanceK !== null ? `K=${loader.stats.linearAdvanceK}` : "---"
            });
            
            addLogEntry(`SYSTEM: Loaded ${loader.moves.length} moves into Printer ${activePrinterId}. Ready to print.`, "SYS");
          }
        } catch (err) {
          console.error("GCode Load Error:", err);
          addLogEntry(`ERROR: Failed to parse G-code.`, "SYS");
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="dashboard-grid" id="app">
      <TopBar />

      {/* Global Modals */}
      {uiModals.configPane && (
        <div className="floating-pane config-modal" id="config-pane" style={{ display: 'block', zIndex: 3000 }}>
          <div className="pane-header">
            <span>CONNECT TO OCTOPRINT</span>
            <span className="close-x-btn" id="modal-close-x" onClick={() => toggleModal('configPane', false)}>×</span>
          </div>
          <div className="config-body">
            <label>Client Instance IP</label>
            <input type="text" defaultValue="192.168.1.42" id="octo-ip" className="industrial-input" />
            <label>API Key</label>
            <input type="password" defaultValue="••••••••••••••••" id="octo-key" className="industrial-input" />
            <div id="test-feedback" className="test-idle">Awaiting parameters...</div>
            <div className="modal-footer">
              <button className="secondary-btn" onClick={() => toggleModal('configPane', false)}>Cancel</button>
              <button className="action-btn" onClick={handleEstablishConnection}>Establish Connection</button>
            </div>
          </div>
        </div>
      )}

      {/* Global Asset Wizard */}
      {uiModals.assetWizard && (
        <div className="floating-pane config-modal" id="asset-wizard" style={{ display: 'block', zIndex: 2000 }}>
          <div className="pane-header">
            <span>{selectedAssetForReconfig ? "EDIT ASSET CONFIGURATION" : "NEW ASSET CONFIGURATION"}</span>
            <span className="close-x-btn" id="wizard-close" onClick={() => { toggleModal('assetWizard', false); setSelectedAssetForReconfig(null); }}>×</span>
          </div>
          <nav className="wizard-tabs">
            <div className={`tab-btn ${activeWizardTab === 'printer-tab' ? 'active' : ''}`} onClick={() => setActiveWizardTab('printer-tab')}>Printer</div>
            <div className={`tab-btn ${activeWizardTab === 'filament-tab' ? 'active' : ''}`} onClick={() => setActiveWizardTab('filament-tab')}>Filament</div>
          </nav>
          <div className="wizard-content">
            {activeWizardTab === 'printer-tab' ? (
              <div className="tab-pane active" id="printer-tab">
                <div className="config-body scrollable">
                  <div id="wizard-group-select-container" style={{ marginTop: '5px', marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-dim)' }}>TARGET ASSIGNMENT</label>
                    <select 
                      className="industrial-select" 
                      value={targetWizardGroupId}
                      onChange={(e) => setTargetWizardGroupId(e.target.value)}
                      style={{ width: '100%', marginTop: '5px' }}
                    >
                      {fleetGroups.map(g => <option key={g.id} value={g.id}>{g.groupName}</option>)}
                    </select>
                  </div>

                  <label>Printer Name</label>
                  <input 
                    type="text" 
                    placeholder="PRINTER_01" 
                    value={wizardData.name}
                    className="industrial-input"
                    onChange={(e) => setWizardData({ ...wizardData, name: e.target.value })}
                  /> 
                  <label>Model</label>
                  <input 
                    type="text" 
                    placeholder="BCN3D+ Custom" 
                    value={wizardData.model}
                    className="industrial-input"
                    onChange={(e) => setWizardData({ ...wizardData, model: e.target.value })}
                  />
                  <div className="input-row">
                    <div><label>Build X</label><input type="number" defaultValue="200" className="industrial-input" /></div>
                    <div><label>Build Y</label><input type="number" defaultValue="200" className="industrial-input" /></div>
                    <div><label>Build Z</label><input type="number" defaultValue="200" className="industrial-input" /></div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="action-btn next-tab" onClick={() => setActiveWizardTab('filament-tab')}>Next: Filament</button>
                </div>
              </div>
            ) : (
              <div className="tab-pane active" id="filament-tab">
                <div className="config-body scrollable">
                  <div className="input-row">
                    <div><label>Material</label><input type="text" defaultValue="PLA" className="industrial-input" /></div>
                    <div><label>Diameter</label><input type="number" defaultValue="1.75" className="industrial-input" /></div>
                  </div>
                  <label>Color</label>
                  <input type="color" defaultValue="#FF6B6B" style={{ height: '30px', width: '100%' }} />
                  <label>Optimal Nozzle Temp</label>
                  <input type="number" defaultValue="205" className="industrial-input" />
                </div>
                <div className="modal-footer">
                  <button className="secondary-btn prev-tab" onClick={() => setActiveWizardTab('printer-tab')}>Back</button>
                  <button className="action-btn" id="finish-asset" onClick={handleFinishAsset}>{selectedAssetForReconfig ? "Save Changes" : "Add Asset"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <FleetSidebar />
      <MainViewport />
      <HealthRail />
      
      {/* Hidden file input for upload simulation */}
      <input type="file" id="global-file-input" style={{ display: 'none' }} onChange={handleFileUpload} />

      <footer className="system-footer">
        <div className="footer-btn">App Settings (Ctrl + .)</div>
        <div className="load-metrics">CPU/GPU: 0.8%</div>
        <div className="uptime">Network Uptime: 99.99%</div>
      </footer>
    </div>
  );
};


export default App;


