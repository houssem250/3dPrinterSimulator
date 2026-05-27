import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * useFleetStore
 * 
 * The Single Source of Truth for the Print Farm Dashboard.
 * This store is updated by the Vanilla Three.js simulation core 
 * and consumed by the React UI components.
 */
export const useFleetStore = create(subscribeWithSelector((set) => ({
  // Fleet status
  printers: {
    0: {
      id: 0,
      name: "Mach 01 - 3D Printer",
      mode: 'disconnected',
      tempHistory: [],
      timeline: [
        { time: "08:00", desc: "Asset Created & Deployed", status: "completed" },
        { time: "08:00", desc: "Status: IDLE", status: "current" }
      ],
      buildX: '220',
      buildY: '220',
      buildZ: '250',
      material: 'PLA',
      diameter: '1.75',
      color: '#FF6B6B',
      nozzleTemp: '205'
    }
  }, // Map of id -> { pos, temps, status, layer }
  activePrinterId: null,
  isFleetInitialized: false,
  activeControlAssetId: null, // For switching sidebar to Control Mode
  targetWizardGroupId: "unassigned",
  lastFocusRequest: 0, // Timestamp to force 3D sync even if ID is same

  // Print Control
  lastPrintCommand: 0,
  printAction: null, // 'start' | 'pause' | 'abort'

  // Fleet Hierarchy (from vanilla_ui)
  fleetGroups: [
    { id: "unassigned", groupName: "Unassigned Assets", isOpen: true, assets: [], canDelete: false },
    {
      id: "g1", groupName: "Production Line A", isOpen: true, assets: [
        {
          name: "Mach 01 - 3D Printer",
          id: 0,
          buildX: '220',
          buildY: '220',
          buildZ: '250',
          material: 'PLA',
          diameter: '1.75',
          color: '#FF6B6B',
          nozzleTemp: '205'
        }
      ], canDelete: true
    }
  ],

  // UI State
  uiModals: {
    configPane: false,
    assetWizard: false,
    globalAddMenu: false,
    statusOptions: false,
    gcodeModal: false
  },

  paneStates: {
    left: true,
    right: true,
    bottom: true
  },

  // OctoPrint Connection
  octoConfig: { ip: 'localhost', apiKey: '' },
  connectionState: { status: 'idle', message: 'Awaiting parameters...' },
  setConnectionState: (status, message) => set({
    connectionState: { status, message }
  }),

  // Placement Mode State
  placementMode: {
    active: false,
    pendingAsset: null // { name, groupId, model, etc. }
  },

  // Calibration State
  calibrationState: {
    selectedTests: { extrusion: false, movement: false, thermal: false },
    generatedGcode: "",
    isRunning: false,
    currentStepText: "", // For LLM-style thinking UI
    results: [] // Array of { name, status: 'pass'|'fail'|'pending' }
  },
  
  updateCalibrationState: (updates) => set((state) => ({
    calibrationState: { ...state.calibrationState, ...updates }
  })),
  
  toggleCalibrationTest: (testName) => set((state) => ({
    calibrationState: {
      ...state.calibrationState,
      selectedTests: {
        ...state.calibrationState.selectedTests,
        [testName]: !state.calibrationState.selectedTests[testName]
      }
    }
  })),

  setPlacementMode: (active, pendingAsset = null) => set({
    placementMode: { active, pendingAsset }
  }),

  // Dynamic Content
  terminalLogs: [
    { time: '12:00:00', type: 'SYS', msg: 'Digital Twin Sync Active' },
    { time: '12:00:01', type: 'SYS', msg: 'Connected to Mosquitto Broker' }
  ],

  horizontalEvents: [
    { time: "08:00", desc: "System Warmup", status: "completed" },
    { time: "08:15", desc: "Auto-Leveling", status: "completed" },
    { time: "08:20", desc: "Print Started", status: "completed" },
    { time: "09:45", desc: "Extruder Check", status: "current" },
    { time: "---", desc: "Planned Finish", status: "pending" }
  ],

  systemAlerts: [
    {
      id: 1,
      type: 'critical',
      title: 'THERMAL RUNAWAY PROTECTION',
      time: '12:04',
      detail: 'Sensor E0 detected a temperature spike exceeding 15°C/s. Heating has been cut.',
      isExpanded: false,
      isFixing: false
    },
    {
      id: 2,
      type: 'warning',
      title: 'Z-AXIS SQUARING ERROR',
      time: '11:50',
      detail: 'Lead screw deviation detected on Z2 motor (>0.12mm).',
      isExpanded: false,
      isFixing: false
    }
  ],

  // Actions
  setFleetInitialized: (val) => set({ isFleetInitialized: val }),

  togglePane: (pane) => set((state) => ({
    paneStates: {
      ...state.paneStates,
      [pane]: !state.paneStates[pane]
    }
  })),

  toggleModal: (modalName, forceState) => set((state) => ({
    uiModals: {
      ...state.uiModals,
      [modalName]: forceState !== undefined ? forceState : !state.uiModals[modalName]
    }
  })),

  toggleGroup: (groupId) => set((state) => ({
    fleetGroups: state.fleetGroups.map(g =>
      g.id === groupId ? { ...g, isOpen: !g.isOpen } : g
    )
  })),

  addLogEntry: (msg, type = 'SYS') => set((state) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    return {
      terminalLogs: [...state.terminalLogs, { time, type, msg }]
    };
  }),

  addTimelineEvent: (desc, status = 'completed') => set((state) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Update global horizontalEvents
    const newEvents = state.horizontalEvents.map(e => e.status === 'current' ? { ...e, status: 'completed' } : e);
    const updatedGlobal = [...newEvents, { time, desc, status }];

    // 2. Also log to active printer's timeline if one is selected!
    const id = state.activePrinterId;
    if (id !== null && state.printers[id]) {
      const existing = state.printers[id];
      const timeSec = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const printerTimeline = [...(existing.timeline || [])];

      // Avoid exact duplicates back-to-back
      if (printerTimeline.length === 0 || printerTimeline[printerTimeline.length - 1].desc !== desc) {
        const updatedPrinterTimeline = printerTimeline.map(e => e.status === 'current' ? { ...e, status: 'completed' } : e);
        updatedPrinterTimeline.push({ time: timeSec, desc, status });

        return {
          horizontalEvents: updatedGlobal,
          printers: {
            ...state.printers,
            [id]: {
              ...existing,
              timeline: updatedPrinterTimeline
            }
          }
        };
      }
    }

    return {
      horizontalEvents: updatedGlobal
    };
  }),

  setControlAsset: (id) => set({ activeControlAssetId: id }),

  addGroup: (name) => set((state) => ({
    fleetGroups: [
      ...state.fleetGroups,
      { id: `g_${Date.now()}`, groupName: name, isOpen: true, assets: [], canDelete: true }
    ]
  })),

  deleteGroup: (id) => set((state) => ({
    fleetGroups: state.fleetGroups.filter(g => g.id !== id)
  })),

  updateAsset: (targetGroupId, assetId, updates) => set((state) => {
    let assetToMove = null;

    // 1. Remove from wherever it is and capture it
    const newGroups = state.fleetGroups.map(group => {
      const remainingAssets = group.assets.filter(a => {
        if (a.id === assetId) {
          assetToMove = { ...a, ...updates }; // Apply updates
          return false;
        }
        return true;
      });
      return { ...group, assets: remainingAssets };
    });

    if (!assetToMove) return state;

    // 2. Insert into target group
    const existingPrinter = state.printers[assetId] || {};
    const updatedPrinters = {
      ...state.printers,
      [assetId]: {
        ...existingPrinter,
        ...updates,
        name: updates.name || existingPrinter.name
      }
    };

    return {
      fleetGroups: newGroups.map(group =>
        group.id === targetGroupId ? { ...group, assets: [...group.assets, assetToMove] } : group
      ),
      printers: updatedPrinters
    };
  }),

  addAsset: (groupId, asset) => set((state) => {
    const id = asset.id || `ASSET_${Date.now()}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const initialTimeline = [
      { time, desc: "Asset Created & Deployed", status: "completed" },
      { time, desc: "Status: IDLE", status: "current" }
    ];
    return {
      fleetGroups: state.fleetGroups.map(g =>
        g.id === groupId ? { ...g, assets: [...g.assets, { ...asset, id }] } : g
      ),
      printers: {
        ...state.printers,
        [id]: {
          id,
          name: asset.name,
          mode: 'disconnected',
          tempHistory: [],
          timeline: initialTimeline
        }
      }
    };
  }),

  deleteAsset: (groupId, assetId) => set((state) => ({
    fleetGroups: state.fleetGroups.map(g =>
      g.id === groupId ? { ...g, assets: g.assets.filter(a => a.id !== assetId) } : g
    )
  })),

  moveAsset: (assetId, targetGroupId = "unassigned") => set((state) => {
    let assetToMove = null;
    const newGroups = state.fleetGroups.map(group => {
      const remainingAssets = group.assets.filter(a => {
        if (a.id === assetId) {
          assetToMove = a;
          return false;
        }
        return true;
      });
      return { ...group, assets: remainingAssets };
    });

    if (!assetToMove) return state;

    return {
      fleetGroups: newGroups.map(group =>
        group.id === targetGroupId ? { ...group, assets: [...group.assets, assetToMove] } : group
      )
    };
  }),

  updateActiveJob: (updates) => set((state) => {
    const id = state.activePrinterId;
    if (id === null) return state;
    const existing = state.printers[id] || {};

    let timeline = existing.timeline ? [...existing.timeline] : null;
    if (!timeline) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timeline = [
        { time, desc: "Asset Created & Deployed", status: "completed" }
        // { time, desc: `Status: ${existing.mode === 'stream' ? 'MQTT Stream Mode' : 'Standalone Mode'}`, status: "current" }
      ];
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const logEvent = (desc, status = 'completed') => {
      if (timeline.length > 0 && timeline[timeline.length - 1].desc === desc) return;
      timeline = timeline.map(e => e.status === 'current' ? { ...e, status: 'completed' } : e);
      timeline.push({ time: timeStr, desc, status });
    };

    // Mode switch through active job status
    if (updates.mode && existing.mode && existing.mode !== updates.mode) {
      const modeLabel = updates.mode === 'stream' ? 'MQTT Stream Mode' :
        updates.mode === 'standalone' ? 'Standalone Mode' : 'Disconnected';
      logEvent(`Status: ${modeLabel}`, "current");
    }

    // Print state updates
    const exPrinting = existing.isPrinting || false;
    if (updates.isPrinting !== undefined && updates.isPrinting !== exPrinting) {
      if (updates.isPrinting) {
        const fileLabel = updates.fileName && updates.fileName !== 'No file selected' ? `: ${updates.fileName}` : '';
        logEvent(`Print Started${fileLabel}`, "current");
      } else if (exPrinting) {
        logEvent("Print Stopped", "completed");
      }
    }
    
    const exPaused = existing.isPaused || false;
    if (updates.isPaused !== undefined && updates.isPaused !== exPaused) {
      if (updates.isPaused) {
        logEvent("Print Paused", "completed");
      } else if (exPaused) {
        logEvent("Print Resumed", "current");
      }
    }

    // Manual targets from active job
    if (updates.htempTarget !== undefined && updates.htempTarget !== existing.htempTarget) {
      logEvent(`Nozzle Target set to ${updates.htempTarget}°C`);
    }
    if (updates.btempTarget !== undefined && updates.btempTarget !== existing.btempTarget) {
      logEvent(`Bed Target set to ${updates.btempTarget}°C`);
    }

    return {
      printers: {
        ...state.printers,
        [id]: {
          ...existing,
          ...updates,
          timeline,
          id
        }
      }
    };
  }),

  selectedAssetForReconfig: null,
  setSelectedAssetForReconfig: (asset) => set({ selectedAssetForReconfig: asset }),

  printerStatus: 'disconnected', // 'connected', 'standalone', 'disconnected'
  setPrinterStatus: (status) => set({ printerStatus: status }),
  setTargetWizardGroupId: (id) => set({ targetWizardGroupId: id }),

  toggleAlert: (id) => set((state) => ({
    systemAlerts: state.systemAlerts.map(a => a.id === id ? { ...a, isExpanded: !a.isExpanded } : a)
  })),

  setAlertFixing: (id, val) => set((state) => ({
    systemAlerts: state.systemAlerts.map(a => a.id === id ? { ...a, isFixing: val, isExpanded: true } : a)
  })),

  resolveAlert: (id) => set((state) => ({
    systemAlerts: state.systemAlerts.filter(a => a.id !== id)
  })),

  /**
   * Updates a specific printer's telemetry.
   */
  updatePrinter: (id, telemetry) => set((state) => {
    const existing = state.printers[id] || {};
    const newHistory = [...(existing.tempHistory || [])];

    // Seed timeline if it doesn't exist
    let timeline = existing.timeline ? [...existing.timeline] : null;
    if (!timeline) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timeline = [
        { time, desc: "Asset Created & Deployed", status: "completed" },
        { time, desc: `Status: ${telemetry.mode === 'stream' ? 'MQTT Stream Mode' : 'Standalone Mode'}`, status: "current" }
      ];
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const logEvent = (desc, status = 'completed') => {
      if (timeline.length > 0 && timeline[timeline.length - 1].desc === desc) return;
      timeline = timeline.map(e => e.status === 'current' ? { ...e, status: 'completed' } : e);
      timeline.push({ time: timeStr, desc, status });
    };

    // Mode switch through telemetry updates
    if (telemetry.mode && existing.mode && existing.mode !== telemetry.mode) {
      const modeLabel = telemetry.mode === 'stream' ? 'MQTT Stream Mode' :
        telemetry.mode === 'standalone' ? 'Standalone Mode' : 'Disconnected';
      logEvent(`Status: ${modeLabel}`, "current");
    }

    // Manual temperatures target updates
    if (telemetry.temp && existing.temp) {
      if (telemetry.temp.nozzleTarget !== undefined && existing.temp.nozzleTarget !== undefined && telemetry.temp.nozzleTarget !== existing.temp.nozzleTarget) {
        logEvent(`Nozzle Target set to ${telemetry.temp.nozzleTarget}°C`);
      }
      if (telemetry.temp.bedTarget !== undefined && existing.temp.bedTarget !== undefined && telemetry.temp.bedTarget !== existing.temp.bedTarget) {
        logEvent(`Bed Target set to ${telemetry.temp.bedTarget}°C`);
      }
    }

    // Print state updates
    if (telemetry.status && existing.status) {
      if (telemetry.status.state !== existing.status.state) {
        if (telemetry.status.state === 'PRINTING' && existing.status.state !== 'PRINTING') {
          logEvent("Print Started", "current");
        } else if (telemetry.status.state === 'PAUSED' && existing.status.state !== 'PAUSED') {
          logEvent("Print Paused", "completed");
        } else if (telemetry.status.state === 'PRINTDONE' && existing.status.state !== 'PRINTDONE') {
          logEvent("Print Completed", "completed");
        } else if (telemetry.status.state === 'PRINTCANCELLED' && existing.status.state !== 'PRINTCANCELLED') {
          logEvent("Print Cancelled", "completed");
        } else if (telemetry.status.state === 'IDLE' && existing.status.state === 'PRINTING') {
          logEvent("Print Finished", "completed");
        }
      }
    }

    // Add new point if it has thermal data
    if (telemetry.temp) {
      const now = Date.now();
      const nozzle = telemetry.temp.nozzle ?? 0;
      const bed = telemetry.temp.bed ?? 0;
      const nozzleTarget = telemetry.temp.nozzleTarget ?? 0;
      const bedTarget = telemetry.temp.bedTarget ?? 0;

      // Add fake heatsink (30-45C depending on nozzle temp)
      const heatsink = 30 + (nozzle * 0.05) + (Math.random() * 0.5);

      newHistory.push({
        time: now,
        nozzle,
        nozzleTarget,
        bed,
        bedTarget,
        heatsink
      });

      // Sliding window: 10 minutes (600,000ms)
      const windowMs = 600000;
      while (newHistory.length > 0 && now - newHistory[0].time > windowMs) {
        newHistory.shift();
      }
    }

    return {
      printers: {
        ...state.printers,
        [id]: {
          ...existing,
          ...telemetry,
          tempHistory: newHistory,
          timeline,
          id
        }
      }
    };
  }),

  /**
   * Selects the active printer to display in the focus detail view.
   */
  setActivePrinter: (id) => set({
    activePrinterId: id,
    lastFocusRequest: Date.now()
  }),

  /**
   * Triggers the 3D camera to return to an overview of the entire farm.
   */
  focusOverview: () => set({
    activePrinterId: null,
    activeControlAssetId: null,
    lastFocusRequest: Date.now()
  }),

  /**
   * Dispatches a print lifecycle command to the 3D engine.
   * @param {'start'|'pause'|'abort'} action 
   */
  setPrintCommand: (action) => set({
    printAction: action,
    lastPrintCommand: Date.now()
  }),

  clearFleet: () => set({
    printers: {},
    activePrinterId: null,
    isFleetInitialized: false,
    fleetGroups: [
      { id: "unassigned", groupName: "Unassigned Assets", isOpen: true, assets: [], canDelete: false }
    ]
  })
})));


