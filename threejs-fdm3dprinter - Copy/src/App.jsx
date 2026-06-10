import React, { useState, useEffect } from 'react';
import { TopBar } from './components/ui/TopBar.jsx';
import { FleetSidebar } from './components/ui/FleetSidebar.jsx';
import { HealthRail } from './components/ui/HealthRail.jsx';
import { MainViewport } from './components/ui/MainViewport.jsx';
import { useFleetStore } from './store/useFleetStore.js';
import { maintenanceEngine } from './core/MaintenanceEngine.js';

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
    connectionState,
    deleteAsset
  } = useFleetStore();

  const [activeWizardTab, setActiveWizardTab] = useState('printer-tab');
  const [wizardData, setWizardData] = useState({
    name: '',
    model: '',
    buildX: '220',
    buildY: '220',
    buildZ: '250',
    material: 'PLA',
    diameter: '1.75',
    color: '#FF6B6B',
    nozzleTemp: '205'
  });

  // Sync wizardData when reconfiguring
  useEffect(() => {
    if (selectedAssetForReconfig) {
      setWizardData({
        name: selectedAssetForReconfig.name || '',
        model: selectedAssetForReconfig.model || '',
        buildX: selectedAssetForReconfig.buildX || '220',
        buildY: selectedAssetForReconfig.buildY || '220',
        buildZ: selectedAssetForReconfig.buildZ || '250',
        material: selectedAssetForReconfig.material || 'PLA',
        diameter: selectedAssetForReconfig.diameter || '1.75',
        color: selectedAssetForReconfig.color || '#FF6B6B',
        nozzleTemp: selectedAssetForReconfig.nozzleTemp || '205'
      });
    } else {
      setWizardData({
        name: '',
        model: '',
        buildX: '220',
        buildY: '220',
        buildZ: '250',
        material: 'PLA',
        diameter: '1.75',
        color: '#FF6B6B',
        nozzleTemp: '205'
      });
    }
  }, [selectedAssetForReconfig]);

  // Start the Maintenance Engine
  useEffect(() => {
    maintenanceEngine.start();
    return () => maintenanceEngine.stop();
  }, []);

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
    const assetPayload = {
      name,
      model: wizardData.model,
      buildX: wizardData.buildX,
      buildY: wizardData.buildY,
      buildZ: wizardData.buildZ,
      material: wizardData.material,
      diameter: wizardData.diameter,
      color: wizardData.color,
      nozzleTemp: wizardData.nozzleTemp
    };
    
    if (selectedAssetForReconfig) {
      // Edit existing asset: Handle both metadata AND possible group move
      updateAsset(targetWizardGroupId, selectedAssetForReconfig.id, assetPayload);
      
      addLogEntry(`SYSTEM: Reconfigured [${name}] and moved to ${fleetGroups.find(g => g.id === targetWizardGroupId)?.groupName}`, "SYS");
      toggleModal('assetWizard', false);
    } else {
      // NEW ASSET: Enter 3D Placement Mode
      setPlacementMode(true, assetPayload);
      addLogEntry(`SYSTEM: Entering deployment mode for ${name}. Select a slot in the 3D scene.`, "SYS");
      toggleModal('assetWizard', false);
    }
    
    setSelectedAssetForReconfig(null);
    setWizardData({
      name: '',
      model: '',
      buildX: '220',
      buildY: '220',
      buildZ: '250',
      material: 'PLA',
      diameter: '1.75',
      color: '#FF6B6B',
      nozzleTemp: '205'
    });
  };

  const handleEstablishConnection = async () => {
    const { 
      setConnectionState, 
      setPrinterStatus, 
      activePrinterId,
      toggleModal
    } = useFleetStore.getState();

    const ip = document.getElementById('octo-ip').value;
    const apiKey = document.getElementById('octo-key').value;

    if (!ip || !apiKey) {
      setConnectionState('error', "IP and API Key are required.");
      return;
    }

    setConnectionState('testing', "Verifying OctoPrint availability...");
    addLogEntry(`SYSTEM: Verifying OctoPrint at ${ip}...`, "SYS");

    const { OctoPrintService } = await import('./services/OctoPrintService.js');
    const result = await OctoPrintService.verifyConnection(ip, apiKey);

    if (result.success) {
      setConnectionState('success', result.message);
      addLogEntry(`SUCCESS: ${result.message}`, "SYS");
      
      // Persist credentials for remote control
      useFleetStore.getState().updateActiveJob({ 
        connectionConfig: { ip, apiKey } 
      });

      // Fetch immediate state to sync UI
      const stateSync = await OctoPrintService.fetchCurrentState(ip, apiKey);
      if (stateSync.success) {
        updateActiveJob({
          isPrinting: stateSync.isPrinting,
          isPaused: stateSync.isPaused,
          fileName: stateSync.fileName,
          progress: stateSync.progress,
          htemp: stateSync.temp.nozzle + " °C",
          btemp: stateSync.temp.bed + " °C"
        });
        if (!stateSync.isOperational) {
          addLogEntry("WARNING: OctoPrint is reachable, but the printer is DISCONNECTED (Serial Port). Please connect it in OctoPrint UI.", "SYS");
        }
      }
      
      // Now switch the actual printer instance mode
      const { AppContext } = await import('../app_context.js');
      const printer = AppContext.farm.printers.find(p => p.id === activePrinterId);
      
      if (printer) {
        // Extract hostname in case user entered "ip:port" (e.g. localhost:5000)
        const hostname = ip.split(':')[0].replace('http://', '').replace('https://', '');
        
        // Construct the MQTT WebSocket URL based on the hostname
        const mqttUrl = `ws://${hostname}:9001`;
        
        await printer.switchMode('stream', { url: mqttUrl });
        setPrinterStatus('connected');
        
        setTimeout(() => {
          toggleModal('configPane', false);
          setConnectionState('idle', "Awaiting parameters...");
        }, 1000);
      }
    } else {
      setConnectionState('error', result.message);
      addLogEntry(`ERROR: ${result.message}`, "SYS");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const { activePrinterId, printers, updateActiveJob, addLogEntry } = useFleetStore.getState();
      if (activePrinterId === null) {
        addLogEntry("ERROR: No active printer selected for upload.", "SYS");
        return;
      }

      const activePrinter = printers[activePrinterId];

      // Handle Remote Upload if in Stream Mode
      if (activePrinter?.mode === 'stream' && activePrinter?.connectionConfig) {
        const { OctoPrintControlService } = await import('./services/OctoPrintControlService.js');
        const { ip, apiKey } = activePrinter.connectionConfig;
        
        addLogEntry(`SYSTEM: Uploading ${file.name} to OctoPrint at ${ip}...`, "SYS");
        const success = await OctoPrintControlService.uploadFile(ip, apiKey, file);
        
        if (success) {
          addLogEntry(`SUCCESS: ${file.name} uploaded to OctoPrint.`, "SYS");
        } else {
          addLogEntry(`ERROR: Failed to upload ${file.name} to OctoPrint.`, "SYS");
        }
        // Even for remote, we might want to load it locally for preview
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
              kfactor: loader.stats.linearAdvanceK !== null ? `K=${loader.stats.linearAdvanceK}` : "---",
              totalTime: loader.stats.estimatedTimeSec
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
            <input type="text" defaultValue="localhost:5000" id="octo-ip" className="industrial-input" />
            <label>API Key</label>
            <input type="password" defaultValue="••••••••••••••••" id="octo-key" className="industrial-input" />
            <div id="test-feedback" className={`test-${connectionState.status}`}>
              {connectionState.message}
            </div>
            <div className="modal-footer">
              <button className="secondary-btn" onClick={() => toggleModal('configPane', false)}>Cancel</button>
              <button className="action-btn" onClick={handleEstablishConnection} disabled={connectionState.status === 'testing'}>
                {connectionState.status === 'testing' ? "Connecting..." : "Establish Connection"}
              </button>
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
                    <div>
                      <label>Build X</label>
                      <input 
                        type="number" 
                        value={wizardData.buildX} 
                        className="industrial-input" 
                        onChange={(e) => setWizardData({ ...wizardData, buildX: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Build Y</label>
                      <input 
                        type="number" 
                        value={wizardData.buildY} 
                        className="industrial-input" 
                        onChange={(e) => setWizardData({ ...wizardData, buildY: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Build Z</label>
                      <input 
                        type="number" 
                        value={wizardData.buildZ} 
                        className="industrial-input" 
                        onChange={(e) => setWizardData({ ...wizardData, buildZ: e.target.value })}
                      />
                    </div>
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
                    <div>
                      <label>Material</label>
                      <input 
                        type="text" 
                        value={wizardData.material} 
                        className="industrial-input" 
                        onChange={(e) => setWizardData({ ...wizardData, material: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Diameter</label>
                      <input 
                        type="number" 
                        value={wizardData.diameter} 
                        className="industrial-input" 
                        onChange={(e) => setWizardData({ ...wizardData, diameter: e.target.value })}
                      />
                    </div>
                  </div>
                  <label>Color</label>
                  <input 
                    type="color" 
                    value={wizardData.color} 
                    style={{ height: '30px', width: '100%' }} 
                    onChange={(e) => setWizardData({ ...wizardData, color: e.target.value })}
                  />
                  <label>Optimal Nozzle Temp</label>
                  <input 
                    type="number" 
                    value={wizardData.nozzleTemp} 
                    className="industrial-input" 
                    onChange={(e) => setWizardData({ ...wizardData, nozzleTemp: e.target.value })}
                  />
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


