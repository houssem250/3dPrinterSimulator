import { create } from 'zustand';

/**
 * useFleetStore
 * 
 * The Single Source of Truth for the Print Farm Dashboard.
 * This store is updated by the Vanilla Three.js simulation core 
 * and consumed by the React UI components.
 */
export const useFleetStore = create((set) => ({
  // Fleet status
  printers: {}, // Map of id -> { pos, temps, status, layer }
  activePrinterId: null,
  isFleetInitialized: false,

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

  // Actions
  setFleetInitialized: (val) => set({ isFleetInitialized: val }),
  
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

  /**
   * Updates a specific printer's telemetry.
   * Called by PrinterState.js (Vanilla context)
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
  setActivePrinter: (id) => set({ activePrinterId: id }),

  /**
   * Clears the entire fleet state.
   */
  clearFleet: () => set({ 
    printers: {}, 
    activePrinterId: null, 
    isFleetInitialized: false,
    fleetGroups: [
      { id: "unassigned", groupName: "Unassigned Assets", isOpen: true, assets: [], canDelete: false }
    ]
  })
}));

