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

  // Actions
  setFleetInitialized: (val) => set({ isFleetInitialized: val }),
  
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
  clearFleet: () => set({ printers: {}, activePrinterId: null, isFleetInitialized: false })
}));
