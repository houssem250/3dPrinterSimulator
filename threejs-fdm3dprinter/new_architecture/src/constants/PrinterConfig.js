/**
 * @file PrinterConfig.js
 */
export const PRINTER_CONFIG = {
  hardware: {
    bed: { width: 350, depth: 350, height: 400 },
    axes: { x: { travel: 350 }, y: { travel: 350 }, z: { travel: 400 } }
  },
  printing: {
    defaultSpeed: 3600,
    filamentColor: '#ff0000'
  }
};
