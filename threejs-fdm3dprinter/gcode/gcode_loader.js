/**
 * @file gcode_loader.js
 * @description Parses a .gcode file (string or File object) into the move
 * list format that `PrintingMotion.loadMoves()` expects.
 *
 * This file was moved from `printer_manager/motion/gcode_loader.js` to
 * `gcode/gcode_loader.js`. It has no dependency on Three.js or any axis
 * class — it is pure string-parsing logic and belongs in its own module.
 *
 * Supported G-code commands
 * ──────────────────────────
 *   G0 / G1    Rapid / print move
 *   G28        Home axes
 *   G90        Absolute positioning (default)
 *   G91        Relative positioning
 *   G92        Set position / reset extruder
 *   M82 / M83  Extruder absolute / relative  (accepted, ignored)
 *   M104 / M109  Hotend temperature  (recorded in stats)
 *   M140 / M190  Bed temperature     (recorded in stats)
 *   M106 / M107  Fan on/off          (recorded in stats)
 *   ;           Comment — stripped
 *
 * Usage
 * ─────
 *   // From a <input type="file"> element:
 *   const loader = new GCodeLoader();
 *   await loader.loadFromFile(fileInput.files[0]);
 *   printer.loadMoves(loader.moves);
 *
 *   // From a URL:
 *   await loader.loadFromURL('models/test.gcode');
 *   printer.loadMoves(loader.moves);
 *
 *   // From a raw string:
 *   loader.parse(gcodeString);
 *   printer.loadMoves(loader.moves);
 *
 * After parsing
 * ─────────────
 *   loader.moves    Array of { cmd, X?, Y?, Z?, F? }
 *   loader.stats    Parse statistics
 *   loader.summary() Prints stats to console
 *
 * @module gcode/gcode_loader
 */

export class GCodeLoader {

  constructor() {
    this.moves = [];
    this.stats = _emptyStats();
  }

  // ── Public loaders ──────────────────────────────────────────────────────────

  /**
   * Reads and parses a browser `File` object (from `<input type="file">`).
   *
   * @param {File} file
   * @returns {Promise<GCodeLoader>} this
   */
  loadFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('loadFromFile: no file provided.')); return; }

      const reader    = new FileReader();
      reader.onload   = (e) => { this.parse(e.target.result); resolve(this); };
      reader.onerror  = ()  => reject(new Error('loadFromFile: FileReader error.'));
      reader.readAsText(file);
    });
  }

  /**
   * Fetches and parses a .gcode file at the given URL.
   *
   * @param {string} url
   * @returns {Promise<GCodeLoader>} this
   */
  async loadFromURL(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`loadFromURL: HTTP ${response.status} for "${url}"`);
    }
    this.parse(await response.text());
    return this;
  }

  /**
   * Parses a raw G-code string synchronously.
   *
   * @param {string} text
   * @returns {GCodeLoader} this
   */
  parse(text) {
    this.moves = [];
    this.stats = _emptyStats();

    let absoluteMode = true;
    let curX = 0, curY = 0, curZ = 0, curE = 0;
    let lastZ = null;

    const lines = text.split('\n');
    this.stats.totalLines = lines.length;

    for (const rawLine of lines) {
      const line = rawLine.split(';')[0].trim();
      if (!line) continue;

      const tokens = line.toUpperCase().split(/\s+/);
      const cmd    = tokens[0];
      const params = _parseParams(tokens);

      // ── G0 / G1 ───────────────────────────────────────────────────────────
      if (cmd === 'G0' || cmd === 'G1') {
        const move = { cmd };

        if (absoluteMode) {
          if (params.X !== undefined) { move.X = params.X; curX = params.X; }
          if (params.Y !== undefined) { move.Y = params.Y; curY = params.Y; }
          if (params.Z !== undefined) { move.Z = params.Z; curZ = params.Z; }
        } else {
          if (params.X !== undefined) { curX += params.X; move.X = curX; }
          if (params.Y !== undefined) { curY += params.Y; move.Y = curY; }
          if (params.Z !== undefined) { curZ += params.Z; move.Z = curZ; }
        }

        if (params.F !== undefined) move.F = params.F;

        if (params.E !== undefined) {
          const eDelta = absoluteMode ? params.E - curE : params.E;
          if (eDelta > 0) this.stats.estimatedFilament += eDelta;
          curE = absoluteMode ? params.E : curE + params.E;
        }

        if (move.Z !== undefined && move.Z !== lastZ) {
          if (lastZ !== null) this.stats.layers++;
          lastZ = move.Z;
        }

        this.moves.push(move);
        this.stats.parsedMoves++;
        continue;
      }

      // ── G28: Home ─────────────────────────────────────────────────────────
      if (cmd === 'G28') {
        const move = { cmd: 'G28' };
        if (params.X !== undefined) { move.X = 0; curX = 0; }
        if (params.Y !== undefined) { move.Y = 0; curY = 0; }
        if (params.Z !== undefined) { move.Z = 0; curZ = 0; }
        if (!Object.keys(params).length) { curX = 0; curY = 0; curZ = 0; }
        this.moves.push(move);
        this.stats.parsedMoves++;
        continue;
      }

      // ── Mode switches ──────────────────────────────────────────────────────
      if (cmd === 'G90') { absoluteMode = true;  continue; }
      if (cmd === 'G91') { absoluteMode = false; continue; }

      // ── G92: Set position ─────────────────────────────────────────────────
      if (cmd === 'G92') {
        const move = { cmd: 'G92' };
        if (params.X !== undefined) { move.X = params.X; curX = params.X; }
        if (params.Y !== undefined) { move.Y = params.Y; curY = params.Y; }
        if (params.Z !== undefined) { move.Z = params.Z; curZ = params.Z; }
        if (params.E !== undefined) curE = params.E;

        if (move.X !== undefined || move.Y !== undefined || move.Z !== undefined) {
          this.moves.push(move);
          this.stats.parsedMoves++;
        }
        continue;
      }

      // ── Temperature commands — stats only ─────────────────────────────────
      if (cmd === 'M104' || cmd === 'M109') {
        if (params.S !== undefined) this.stats.hotendTemp = params.S;
        continue;
      }
      if (cmd === 'M140' || cmd === 'M190') {
        if (params.S !== undefined) this.stats.bedTemp = params.S;
        continue;
      }

      this.stats.skipped++;
    }

    console.log(`G-code parsed: ${this.stats.parsedMoves} moves, ${this.stats.layers} layers`);
    return this;
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────────

  /** Prints a parse summary to the console. */
  summary() {
    const s = this.stats;
    console.log('\n========== G-CODE SUMMARY ==========');
    console.log(`   Total lines    : ${s.totalLines}`);
    console.log(`   Parsed moves   : ${s.parsedMoves}`);
    console.log(`   Skipped lines  : ${s.skipped}`);
    console.log(`   Layers         : ${s.layers}`);
    console.log(`   Hotend temp    : ${s.hotendTemp ?? 'not set'} °C`);
    console.log(`   Bed temp       : ${s.bedTemp    ?? 'not set'} °C`);
    console.log(`   Est. filament  : ${s.estimatedFilament.toFixed(1)} mm`);
    console.log('=====================================\n');
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Parses parameter tokens after the command letter into a map.
 * e.g. ['G1', 'X10.5', 'Y-3', 'F1800'] → { X: 10.5, Y: -3, F: 1800 }
 *
 * @param {string[]} tokens  All tokens including the command at index 0.
 * @returns {Record<string, number>}
 */
function _parseParams(tokens) {
  const params = {};
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 2) continue;
    const val = parseFloat(token.slice(1));
    if (!isNaN(val)) params[token[0]] = val;
  }
  return params;
}

/**
 * Returns a zeroed stats object.
 * @returns {object}
 */
function _emptyStats() {
  return {
    totalLines:        0,
    parsedMoves:       0,
    skipped:           0,
    layers:            0,
    hotendTemp:        null,
    bedTemp:           null,
    estimatedFilament: 0,
  };
}
