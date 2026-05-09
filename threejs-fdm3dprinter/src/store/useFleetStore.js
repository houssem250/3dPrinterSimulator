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
  printers: {}, // Map of id -> { pos, temps, status, layer }
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
    { id: "g1", groupName: "Production Line A", isOpen: true, assets: [
        { name: "Mach 01 - 3D Printer", id: 0 }
    ], canDelete: true }
  ],

  // UI State
  uiModals: {
    configPane: false,
    assetWizard: false,
    globalAddMenu: false,
    statusOptions: false
  },

  paneStates: {
    left: true,
    right: true,
    bottom: true
  },

  // Placement Mode State
  placementMode: {
    active: false,
    pendingAsset: null // { name, groupId, model, etc. }
  },

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
    const newEvents = state.horizontalEvents.map(e => e.status === 'current' ? { ...e, status: 'completed' } : e);
    return {
      horizontalEvents: [...newEvents, { time, desc, status }]
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
    return {
      fleetGroups: newGroups.map(group => 
        group.id === targetGroupId ? { ...group, assets: [...group.assets, assetToMove] } : group
      )
    };
  }),

  addAsset: (groupId, asset) => set((state) => ({
    fleetGroups: state.fleetGroups.map(g => 
      g.id === groupId ? { ...g, assets: [...g.assets, { ...asset, id: asset.id || `ASSET_${Date.now()}` }] } : g
    )
  })),

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
    
    return {
      printers: {
        ...state.printers,
        [id]: {
          ...(state.printers[id] || {}),
          ...updates,
          id: id
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
  updatePrinter: (id, telemetry) => set((state) => ({
    printers: {
      ...state.printers,
      [id]: { 
        ...(state.printers[id] || {}), 
        ...telemetry,
        id 
      }
    }
  })),

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


