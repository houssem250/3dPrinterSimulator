import React, { useState, useEffect } from 'react';
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
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const [connectionData, setConnectionData] = useState(null);
  const [selectedPort, setSelectedPort] = useState('AUTO');
  const [selectedBaudrate, setSelectedBaudrate] = useState('AUTO');
  const [isConnecting, setIsConnecting] = useState(false);

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

  const fetchConnectionData = async () => {
    const currentPrinter = activePrinterId !== null ? printers[activePrinterId] : null;
    if (!currentPrinter || currentPrinter.mode !== 'stream' || !currentPrinter.connectionConfig) return;
    const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
    const { ip, apiKey } = currentPrinter.connectionConfig;
    const data = await OctoPrintControlService.getConnection(ip, apiKey);
    if (data) {
      setConnectionData(data);
      if (data.current) {
        setSelectedPort(data.current.port || 'AUTO');
        setSelectedBaudrate(data.current.baudrate || 'AUTO');
      }
    }
  };

  useEffect(() => {
    if (showConnectionPanel) {
      fetchConnectionData();
    }
  }, [showConnectionPanel, activeControlAssetId]);

  useEffect(() => {
    if (isConnecting && connectionData?.current?.state === 'Operational') {
      setShowConnectionPanel(false);
      setIsConnecting(false);
      useFleetStore.getState().addLogEntry("SYSTEM: Serial connection established successfully.", "SYS");
    }
  }, [connectionData?.current?.state, isConnecting]);

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

  const isPrinting = !!(currentPrinter?.status?.isPrinting || currentPrinter?.isPrinting);
  const isPaused = !!(currentPrinter?.status?.isPaused || currentPrinter?.isPaused);

  let rawState = currentPrinter?.status?.state || currentPrinter?.state;
  if (!rawState || rawState === "IDLE") {
    rawState = isPrinting ? (isPaused ? "PAUSED" : "PRINTING") : "IDLE";
  }

  const activeJob = {
    fileName: currentPrinter?.fileName || "No file selected",
    progress: currentPrinter?.progress || 0,
    isPrinting,
    isPaused,
    state: rawState,
    lines: currentPrinter?.lines || "---",
    moves: currentPrinter?.moves || "---",
    skipped: currentPrinter?.skipped || "---",
    // layers: `${currentPrinter?.layer || 0} / ${currentPrinter?.layers || "---"}`,
    layers: `${currentPrinter?.layers || "---"}`,
    htemp: currentPrinter?.htemp || "---",
    btemp: currentPrinter?.btemp || "---",
    filament: currentPrinter?.filament || "---",
    kfactor: currentPrinter?.kfactor || "---",
    totalTime: currentPrinter?.totalTime || null,
    mode: currentPrinter?.mode || 'standalone',
    connectionConfig: currentPrinter?.connectionConfig || null,
    timeElapsed: currentPrinter?.timeElapsed || 0,
    timeLeft: currentPrinter?.timeLeft || 0
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return "--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const remainingTimeStr = activeJob.mode === 'stream'
    ? formatDuration(activeJob.timeLeft)
    : activeJob.totalTime
      ? formatDuration(activeJob.totalTime * (1 - (activeJob.progress / 100)))
      : "--:--";

  const getStatusDisplay = () => {
    const rawState = (activeJob.state || "").toUpperCase();

    if (rawState === "PRINTING" || rawState === "PRINTSTARTED") {
      return { text: "PRINTING", color: "var(--accent-green)", glow: "var(--accent-green)" };
    }
    if (rawState === "PAUSED" || rawState === "PRINTPAUSED") {
      return { text: "PAUSED", color: "var(--accent-amber)", glow: "var(--accent-amber)" };
    }
    if (rawState === "PRINTDONE") {
      return { text: "FINISHED", color: "var(--accent-blue)", glow: "transparent" };
    }
    if (rawState === "PRINTCANCELLED") {
      return { text: "CANCELLED", color: "var(--accent-red)", glow: "transparent" };
    }
    if (rawState === "PRINTFAILED") {
      return { text: "FAILED", color: "var(--accent-red)", glow: "transparent" };
    }
    if (rawState === "STARTING") {
      return { text: "STARTING", color: "var(--accent-blue)", glow: "var(--accent-blue)" };
    }

    // Fallback based on mode
    if (activeJob.mode === 'stream') {
      return { text: "ONLINE", color: "var(--accent-green)", glow: "transparent" };
    }
    return { text: "STANDBY", color: "var(--text-dim)", glow: "transparent" };
  };

  const getTempColor = (tempStr, threshold = 40) => {
    const numeric = parseFloat(tempStr);
    if (isNaN(numeric) || numeric < threshold) return 'var(--text-dim)';
    if (numeric < 150) return 'var(--accent-amber)';
    return 'var(--accent-red)';
  };

  const status = getStatusDisplay();

  const handleStartPrint = async () => {
    const { updateActiveJob, setPrintCommand, addLogEntry } = useFleetStore.getState();

    // If no file, trigger upload dialog
    if (activeJob.fileName === "No file selected") {
      addLogEntry("SYSTEM: No file loaded. Opening file picker...", "SYS");
      document.getElementById('global-file-input').click();
      return;
    }

    if (activeJob.mode === 'stream' && activeJob.connectionConfig) {
      const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
      const { ip, apiKey } = activeJob.connectionConfig;

      // Optimistically unlock Pause and Abort buttons instantly
      updateActiveJob({ isPrinting: true, isPaused: false });

      addLogEntry(`SYSTEM: Remote command [LOAD_AND_START] sent to OctoPrint at ${ip}`, "SYS");

      // Try to select and print the current filename
      const success = await OctoPrintControlService.selectAndPrint(ip, apiKey, activeJob.fileName);

      if (!success) {
        // Fallback to simple start if select failed
        await OctoPrintControlService.issueJobCommand(ip, apiKey, 'start');
      }
    } else {
      setPrintCommand('start');
      updateActiveJob({ isPrinting: true, isPaused: false });
      addLogEntry(`COMMAND: START_PRINT for ${activeJob.fileName} initiated.`, "SYS");
    }
  };

  const handlePausePrint = async () => {
    const { updateActiveJob, setPrintCommand, addLogEntry } = useFleetStore.getState();
    if (!activeJob.isPrinting && activeJob.mode === 'standalone') return;

    const newPausedState = !activeJob.isPaused;
    const action = newPausedState ? 'pause' : 'resume';

    // Optimistic update for UI snappiness
    updateActiveJob({ isPaused: newPausedState });

    if (activeJob.mode === 'stream' && activeJob.connectionConfig) {
      const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
      const { ip, apiKey } = activeJob.connectionConfig;
      addLogEntry(`SYSTEM: Remote command [${action.toUpperCase()}] sent to OctoPrint at ${ip}`, "SYS");

      const result = await OctoPrintControlService.issueJobCommand(ip, apiKey, action);
      if (!result.success) {
        addLogEntry(`ERROR: Remote ${action} failed. Reverting state.`, "SYS");
        updateActiveJob({ isPaused: activeJob.isPaused }); // Revert
      }
    } else {
      setPrintCommand(action);
      addLogEntry(`COMMAND: ${action.toUpperCase()}_PRINT requested.`, "SYS");
    }
  };

  const handleAbortPrint = async () => {
    const { updateActiveJob, setPrintCommand, addLogEntry } = useFleetStore.getState();

    if (activeJob.mode === 'stream' && activeJob.connectionConfig) {
      const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
      const { ip, apiKey } = activeJob.connectionConfig;
      addLogEntry(`SYSTEM: Remote command [CANCEL] sent to OctoPrint at ${ip}`, "SYS");
      await OctoPrintControlService.issueJobCommand(ip, apiKey, 'cancel');
    } else {
      setPrintCommand('abort');
      updateActiveJob({ isPrinting: false, isPaused: false, progress: 0 });
      addLogEntry("COMMAND: ABORT_PRINT - cutting power.", "SYS");
    }
  };

  const handleDownloadFile = async () => {
    const { addLogEntry } = useFleetStore.getState();
    if (!activeJob.fileName || activeJob.fileName === "No file selected") return;

    if (activeJob.mode === 'stream' && activeJob.connectionConfig) {
      const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
      const { ip, apiKey } = activeJob.connectionConfig;
      addLogEntry(`SYSTEM: Requesting download for ${activeJob.fileName}`, "SYS");
      const downloadUrl = OctoPrintControlService.getDownloadUrl(ip, apiKey, activeJob.fileName);
      window.open(downloadUrl, '_blank');
    } else {
      addLogEntry(`Cannot download in standalone mode.`, "SYS");
    }
  };

  const handleDeleteFile = async () => {
    const { updateActiveJob, addLogEntry } = useFleetStore.getState();
    if (!activeJob.fileName || activeJob.fileName === "No file selected") return;

    const confirmDelete = window.confirm(`Are you sure you want to delete ${activeJob.fileName}?`);
    if (!confirmDelete) return;

    if (activeJob.mode === 'stream' && activeJob.connectionConfig) {
      const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
      const { ip, apiKey } = activeJob.connectionConfig;
      addLogEntry(`SYSTEM: Deleting file ${activeJob.fileName} from OctoPrint at ${ip}`, "SYS");
      const success = await OctoPrintControlService.deleteFile(ip, apiKey, activeJob.fileName);
      if (success) {
        updateActiveJob({ fileName: "No file selected", progress: 0 });
      } else {
        addLogEntry(`ERROR: Failed to delete ${activeJob.fileName}`, "SYS");
      }
    } else {
      updateActiveJob({ fileName: "No file selected", progress: 0 });
      addLogEntry(`Deleted ${activeJob.fileName} from local UI.`, "SYS");
    }
  };

  const handleConnect = async () => {
    const { addLogEntry } = useFleetStore.getState();
    if (!activeJob.connectionConfig) return;
    const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
    const { ip, apiKey } = activeJob.connectionConfig;

    addLogEntry(`SYSTEM: Connecting to OctoPrint at ${ip} (${selectedPort} @ ${selectedBaudrate})`, "SYS");
    setIsConnecting(true);
    const success = await OctoPrintControlService.setConnection(ip, apiKey, 'connect', selectedPort, selectedBaudrate);
    if (success) {
      addLogEntry(`SYSTEM: Connect command sent successfully.`, "SYS");
      let attempts = 0;
      const interval = setInterval(async () => {
        await fetchConnectionData();
        attempts++;
        if (attempts > 5) clearInterval(interval);
      }, 2000);
    } else {
      setIsConnecting(false);
      addLogEntry(`ERROR: Failed to connect.`, "SYS");
    }
  };

  const handleDisconnect = async () => {
    const { addLogEntry } = useFleetStore.getState();
    if (!activeJob.connectionConfig) return;
    const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
    const { ip, apiKey } = activeJob.connectionConfig;

    addLogEntry(`SYSTEM: Disconnecting OctoPrint at ${ip}`, "SYS");
    const success = await OctoPrintControlService.setConnection(ip, apiKey, 'disconnect');
    if (success) {
      addLogEntry(`SYSTEM: Disconnect command sent successfully.`, "SYS");
      setTimeout(fetchConnectionData, 2000);
    } else {
      addLogEntry(`ERROR: Failed to disconnect.`, "SYS");
    }
  };

  const handleSetManualTemp = async (type, val) => {
    if (!val) return;
    const tempVal = Number(val);

    if (activeJob.mode === 'stream' && activeJob.connectionConfig) {
      const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
      const { ip, apiKey } = activeJob.connectionConfig;
      addLogEntry(`SYSTEM: Remote ${type} target set to ${tempVal}°C`, "SYS");
      await OctoPrintControlService.setTemperature(ip, apiKey, type === 'nozzle' ? 'tool' : 'bed', tempVal);
    } else {
      addLogEntry(`Manual ${type} set to ${tempVal}°C`, "current");
      const updates = type === 'nozzle' ? { htemp: tempVal + " °C" } : { btemp: tempVal + " °C" };
      updateActiveJob(updates);
    }
  };

  const handleApplyPreset = async (e) => {
    const select = e.target.previousSibling.querySelector('select');
    const [nozzle, bed] = select.value.split(',').map(Number);

    if (activeJob.mode === 'stream' && activeJob.connectionConfig) {
      const { OctoPrintControlService } = await import('../../services/OctoPrintControlService.js');
      const { ip, apiKey } = activeJob.connectionConfig;
      addLogEntry(`SYSTEM: Remote Thermal targets set: ${nozzle}°C / ${bed}°C`, "SYS");
      await OctoPrintControlService.setTemperature(ip, apiKey, 'tool', nozzle);
      await OctoPrintControlService.setTemperature(ip, apiKey, 'bed', bed);
    } else {
      addLogEntry(`Thermal Preset Applied: ${nozzle}°C / ${bed}°C`, "current");
      updateActiveJob({ htemp: nozzle + " °C", btemp: bed + " °C" });
    }
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
                {activeJob.mode === 'stream' && (
                  <div className="temp-control-section">
                    <div
                      className="temp-section-title"
                      style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', userSelect: 'none' }}
                      onClick={() => setShowConnectionPanel(!showConnectionPanel)}
                    >
                      <span>Serial Connection</span>
                      <span>{showConnectionPanel ? '▲' : '▼'}</span>
                    </div>

                    {showConnectionPanel && (
                      <div style={{ marginTop: '10px' }}>
                        <div className="meta-row" style={{ marginBottom: '10px' }}>
                          <span>State:</span>
                          <span style={{
                            color: connectionData?.current?.state === 'Operational' ? 'var(--accent-green)' :
                              connectionData?.current?.state === 'Offline' ? 'var(--text-dim)' : 'var(--accent-amber)',
                            fontWeight: 'bold'
                          }}>
                            {connectionData?.current?.state || 'Unknown'}
                          </span>
                        </div>

                        <div className="preset-group" style={{ marginBottom: '10px' }}>
                          <div className="temp-input-wrapper">
                            <label>Serial Port</label>
                            <select
                              className="industrial-select"
                              value={selectedPort}
                              onChange={(e) => setSelectedPort(e.target.value)}
                            >
                              <option value="AUTO">AUTO</option>
                              {connectionData?.options?.ports?.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="preset-group" style={{ marginBottom: '10px' }}>
                          <div className="temp-input-wrapper">
                            <label>Baudrate</label>
                            <select
                              className="industrial-select"
                              value={selectedBaudrate}
                              onChange={(e) => setSelectedBaudrate(e.target.value)}
                            >
                              <option value="AUTO">AUTO</option>
                              {connectionData?.options?.baudrates?.map(b => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            className="action-btn"
                            style={{ flex: 1, height: '32px' }}
                            onClick={handleConnect}
                            disabled={connectionData?.current?.state === 'Operational'}
                          >
                            CONNECT
                          </button>
                          <button
                            className="secondary-btn"
                            style={{ flex: 1, height: '32px' }}
                            onClick={handleDisconnect}
                            disabled={connectionData?.current?.state === 'Offline'}
                          >
                            DISCONNECT
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="job-status-card" style={{ marginBottom: "5px" }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>ACTIVE FILE</label>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '8px',
                      fontWeight: 'bold',
                      color: status.color,
                      background: 'rgba(255, 255, 255, 0.03)',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      boxShadow: `0 0 8px ${status.glow}20`
                    }}>
                      <span className={activeJob.isPrinting && !activeJob.isPaused ? "status-pulse-dot" : ""} style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: status.color,
                        display: 'inline-block',
                        boxShadow: `0 0 5px ${status.color}`
                      }}></span>
                      {status.text}
                    </div>
                  </div>
                  <div id="active-filename" style={{ fontSize: '12px', margin: '5px 0', color: 'var(--accent-green)', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeJob.fileName}</div>
                  <div className="progress-bar-container">
                    <div id="print-progress-fill" className="progress-fill" style={{ width: `${activeJob.progress}%` }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span>{activeJob.progress}%</span>
                    <span>Est: {remainingTimeStr}</span>
                  </div>
                </div>

                <div className="control-grid">
                  <button
                    className="action-btn btn-start"
                    onClick={handleStartPrint}
                    disabled={activeJob.fileName === "No file selected" || activeJob.isPrinting}
                  >
                    START
                  </button>
                  <button
                    className={`secondary-btn ${activeJob.isPaused ? "btn-paused-breathe" : ""}`}
                    onClick={handlePausePrint}
                    disabled={!activeJob.isPrinting}
                  >
                    {activeJob.isPaused ? "CONTINUE" : "PAUSE"}
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => document.getElementById('global-file-input').click()}
                  >
                    UPLOAD
                  </button>
                  <button
                    className="action-btn btn-abort"
                    onClick={handleAbortPrint}
                    disabled={!activeJob.isPrinting}
                    style={{ background: 'var(--accent-red)', color: '#fff' }}
                  >
                    ABORT
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={handleDownloadFile}
                    disabled={activeJob.fileName === "No file selected" || activeJob.mode !== 'stream'}
                  >
                    DOWNLOAD
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={handleDeleteFile}
                    disabled={activeJob.fileName === "No file selected" || activeJob.isPrinting}
                    style={{ color: 'var(--accent-red)' }}
                  >
                    DELETE
                  </button>
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
                      handleSetManualTemp('nozzle', val);
                    }}>SET</button>
                  </div>
                  <div className="manual-temp-group" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <div className="temp-input-wrapper">
                      <label>Bed (°C)</label>
                      <input type="number" className="industrial-input" placeholder="60" style={{ width: '100%' }} />
                    </div>
                    <button className="btn-set" style={{ height: '32px', alignSelf: 'flex-end' }} onClick={(e) => {
                      const val = e.target.previousSibling.querySelector('input').value;
                      handleSetManualTemp('bed', val);
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
