/**
 * @file gcode_loader.js
 * @description A robust G-code parser designed for high-fidelity physical simulation.
 *
 * This module converts raw .gcode files into a synchronized list of motion and 
 * state commands. Unlike a simple text-to-JSON mapper, this parser maintains 
 * the internal state of the virtual machine (modes, units, offsets) to ensure 
 * the output moves are accurately represented in 3D world space.
 *
 * Supported commands
 * ──────────────────
 *  Motion
 *    G0          Rapid travel move (no extrusion)
 *    G1          Print move (with optional extrusion)
 *    G2 / G3     Arc move (linearised into G1 segments)
 *    G4          Dwell / pause for N ms or S seconds
 *    G20 / G21   Inch / millimetre mode
 *    G28         Home axes
 *    G29         Auto bed-level (treated as homed — no physical effect)
 *    G90 / G91   Absolute / relative positioning
 *    G92         Set logical position (virtual zero)
 *
 * Supported Command Categories
 * ────────────────────────────
 * 1. Motion Control:
 *    - G0 / G1: Rapid vs linear interpolation.
 *    - G2 / G3: Mathematical arcs (linearized into segments for the renderer).
 *    - G4: Dwell commands to simulate motor pauses.
 *    - G28 / G29: Homing and bed leveling (visual state updates).
 *
 * 2. Coordinate System Management:
 *    - G20 / G21: Inch vs Millimeter conversion.
 *    - G90 / G91: Absolute vs Relative positioning.
 *    - G92: Virtual zero / coordinate offset management.
 * 
 * 3. Extrusion Dynamics:
 *    - M82 / M83: Absolute vs Relative E-axis modes.
 *
 *  Temperature
 *    M104 / M109 Set / wait for hotend temperature
 *    M140 / M190 Set / wait for bed temperature
 *    M106 / M107 Fan on (speed S 0-255) / fan off
 *
 *  Motion parameters
 *    M204        Set acceleration (S = print, P = print, T = travel)
 *    M205        Set jerk (X, Y, Z, E)
 *    M220        Set speed override %  (S)
 *    M221        Set flow override %   (S)
 *
 *  Print control
 *    M0 / M1     Pause (treated as break in filament path)
 *    M84 / M18   Disable steppers (treated as no-op — visual only)
 *    M900        Linear advance K factor (recorded in stats)
 *
 *  Slicer metadata comments
 *    ;HEIGHT:<n>     Layer height override → SET_HEIGHT pseudo-command
 *    ;WIDTH:<n>      Extrusion width override → SET_WIDTH pseudo-command
 *    ;LAYER:<n>      Layer index annotation
 *    ;TYPE:<t>       Segment type (WALL-INNER, FILL, SUPPORT …)
 *    ;LAYER_COUNT:<n> Total layer count hint
 *    ;TIME:<s>       Estimated print time (seconds)
 *    ;Filament used  Estimated filament length
 *
 * @module gcode/gcode_loader
 */

export class GCodeLoader {

  /**
   * Initializes the GCodeLoader with empty state and stats.
   */
  constructor() {
    this.moves = [];
    this.stats = _emptyStats();
  }

  // ── Public loaders ──────────────────────────────────────────────────────────

  /**
   * Reads and parses a browser `File` object (from `<input type="file">`).
   * @param {File} file
   * @returns {Promise<GCodeLoader>} this
   */
  loadFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('loadFromFile: no file provided.')); return; }
      const reader = new FileReader();
      reader.onload = (e) => { this.parse(e.target.result); resolve(this); };
      reader.onerror = () => reject(new Error('loadFromFile: FileReader error.'));
      reader.readAsText(file);
    });
  }

  /**
   * Fetches and parses a .gcode file at the given URL.
   * @param {string} url
   * @returns {Promise<GCodeLoader>} this
   */
  async loadFromURL(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`loadFromURL: HTTP ${response.status} for "${url}"`);
    this.parse(await response.text());
    return this;
  }

  /**
   * Parses a raw G-code string synchronously.
   * 
   * This method performs several critical operations:
   * 1. Strips comments and identifies commands (G, M, etc.).
   * 2. Maintains a virtual machine state (unit modes, absolute/relative positioning).
   * 3. Calculates absolute coordinates even when input is relative.
   * 4. Linearises complex arcs (G2/G3) into standard G1 moves.
   * 5. Tracks real-time statistics (filament used, layers encountered).
   *
   * @param {string} text Raw G-code text.
   * @returns {GCodeLoader} this
   */
  parse(text) {
    this.moves = [];
    this.stats = _emptyStats();

    // ── Parser state ────────────────────────────────────────────────────────
    let absoluteMode = true;   // G90 / G91
    let absoluteE = true;   // M82 / M83
    let inchMode = false;  // G20 / G21
    let curX = 0, curY = 0, curZ = 0, curE = 0;
    let lastZ = null;
    let currentF = 1800;   // mm/min
    let currentLayer = 0;
    let cmdIndex = 0; // Incremental pointer for synchronization

    const lines = text.split('\n');
    this.stats.totalLines = lines.length;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      // ── Slicer metadata comments ─────────────────────────────────────────
      if (trimmed.startsWith(';')) {
        this._parseMetaComment(trimmed);
        continue;
      }

      // Strip inline comment, skip empty
      const line = trimmed.split(';')[0].trim();
      if (!line) continue;

      const tokens = line.toUpperCase().split(/\s+/);
      const cmd = tokens[0];
      const params = _parseParams(tokens);

      // ── Unit conversion helper ──────────────────────────────────────────
      const toMm = (v) => (inchMode ? v * 25.4 : v);

      // ── G0 / G1 ─────────────────────────────────────────────────────────
      if (cmd === 'G0' || cmd === 'G1') {
        if (params.F !== undefined) currentF = params.F;
        const move = { cmd, F: currentF };

        if (absoluteMode) {
          if (params.X !== undefined) { move.X = toMm(params.X); curX = move.X; }
          if (params.Y !== undefined) { move.Y = toMm(params.Y); curY = move.Y; }
          if (params.Z !== undefined) { move.Z = toMm(params.Z); curZ = move.Z; }
        } else {
          // Relative mode — accumulate
          if (params.X !== undefined) { curX += toMm(params.X); move.X = curX; }
          if (params.Y !== undefined) { curY += toMm(params.Y); move.Y = curY; }
          if (params.Z !== undefined) { curZ += toMm(params.Z); move.Z = curZ; }
        }

        move.cmdIndex = ++cmdIndex;

        // Extrusion detection
        const eVal = params.E !== undefined ? toMm(params.E) : undefined;
        let eDelta = 0;
        if (eVal !== undefined) {
          eDelta = absoluteE ? (eVal - curE) : eVal;
        }
        
        const hasXY = (params.X !== undefined || params.Y !== undefined);
        move.isExtruding = (cmd === 'G1' && eVal !== undefined && eDelta > 0.001 && hasXY);

        if (eVal !== undefined) {
          if (absoluteE) {
            if (eDelta > 0) this.stats.estimatedFilament += eDelta;
            curE = eVal;
            move.E = eVal;
          } else {
            if (eVal > 0) this.stats.estimatedFilament += eVal;
            curE += eVal;
            move.E = curE;
          }
        }

        // Layer detection via Z change
        if (move.Z !== undefined && move.Z !== lastZ) {
          if (lastZ !== null) this.stats.layers++;
          lastZ = move.Z;
        }

        this.moves.push(move);
        this.stats.parsedMoves++;
        continue;
      }

      // ── G2 / G3: Arc moves ───────────────────────────────────────────────
      if (cmd === 'G2' || cmd === 'G3') {
        const arcMoves = _lineariseArc(
          curX, curY, curZ, curE,
          params, cmd === 'G3', absoluteMode, absoluteE, inchMode, currentF,
        );
        const idx = ++cmdIndex;
        for (const m of arcMoves) {
          m.cmdIndex = idx;
          // Arcs are typically G2/G3, which are shorthand for G1 with E.
          // _lineariseArc already calculates E for segments.
          const eDelta = (m.E !== undefined) ? (m.E - curE) : 0;
          m.isExtruding = (eDelta > 0.001);

          this.moves.push(m);
          this.stats.parsedMoves++;
          if (m.E !== undefined && m.E > curE) this.stats.estimatedFilament += (m.E - curE);
          if (m.E !== undefined) curE = m.E;
          if (m.X !== undefined) curX = m.X;
          if (m.Y !== undefined) curY = m.Y;
          if (m.Z !== undefined) curZ = m.Z;
        }
        continue;
      }

      // ── G4: Dwell ────────────────────────────────────────────────────────
      if (cmd === 'G4') {
        const ms = params.P !== undefined ? params.P
          : params.S !== undefined ? params.S * 1000 : 0;
        if (ms > 0) {
          const m = { cmd: 'G4', dwell: ms, cmdIndex: ++cmdIndex };
          this.moves.push(m);
        }
        this.stats.parsedMoves++;
        continue;
      }

      // ── G20 / G21: Unit mode ─────────────────────────────────────────────
      if (cmd === 'G20') { inchMode = true; this.moves.push({ cmd: 'G20' }); continue; }
      if (cmd === 'G21') { inchMode = false; this.moves.push({ cmd: 'G21' }); continue; }

      // ── G28: Home ────────────────────────────────────────────────────────
      if (cmd === 'G28') {
        const hasArgs = (params.X !== undefined || params.Y !== undefined || params.Z !== undefined);
        const move = { cmd: 'G28' };
        if (!hasArgs) { curX = 0; curY = 0; curZ = 0; curE = 0; }
        else {
          if (params.X !== undefined) { move.X = 0; curX = 0; }
          if (params.Y !== undefined) { move.Y = 0; curY = 0; }
          if (params.Z !== undefined) { move.Z = 0; curZ = 0; }
        }
        lastZ = null;
        move.cmdIndex = ++cmdIndex;
        this.moves.push(move);
        this.stats.parsedMoves++;
        continue;
      }

      // ── G29: Auto bed-level (mark homed, no motion) ──────────────────────
      if (cmd === 'G29') {
        this.moves.push({ cmd: 'G29' });
        this.stats.parsedMoves++;
        continue;
      }

      // ── G90 / G91 ────────────────────────────────────────────────────────
      if (cmd === 'G90') { absoluteMode = true; continue; }
      if (cmd === 'G91') { absoluteMode = false; continue; }

      // ── G92: Set logical position ─────────────────────────────────────────
      if (cmd === 'G92') {
        const move = { cmd: 'G92' };
        // G92 with no parameters is a shorthand to reset 'E' to 0 (Marlin convention).
        // This is often used by slicers before starting a new path segment.
        if (Object.keys(params).length === 0) {
          curE = 0; move.E = 0;
        } else {
          if (params.X !== undefined) { move.X = toMm(params.X); curX = move.X; }
          if (params.Y !== undefined) { move.Y = toMm(params.Y); curY = move.Y; }
          if (params.Z !== undefined) { move.Z = toMm(params.Z); curZ = move.Z; }
          if (params.E !== undefined) { move.E = toMm(params.E); curE = move.E; }
        }
        move.cmdIndex = ++cmdIndex;
        this.moves.push(move);
        this.stats.parsedMoves++;
        continue;
      }

      // ── M82 / M83: Extrusion mode ────────────────────────────────────────
      if (cmd === 'M82') { absoluteE = true; continue; }
      if (cmd === 'M83') { absoluteE = false; continue; }

      // ── Temperature & fans ───────────────────────────────────────────────
      if (cmd === 'M104' || cmd === 'M109') {
        const temp = params.S ?? 0;
        if (temp > this.stats.hotendTemp) this.stats.hotendTemp = temp;
        this.moves.push({ cmd, temp, wait: cmd === 'M109' });
        this.stats.parsedMoves++;
        continue;
      }
      if (cmd === 'M140' || cmd === 'M190') {
        const temp = params.S ?? 0;
        if (temp > this.stats.bedTemp) this.stats.bedTemp = temp;
        this.moves.push({ cmd, temp, wait: cmd === 'M190' });
        this.stats.parsedMoves++;
        continue;
      }
      if (cmd === 'M106') {
        // S is 0-255, normalise to 0-100%
        const speed = Math.round(((params.S ?? 255) / 255) * 100);
        this.moves.push({ cmd: 'M106', fanSpeed: speed });
        this.stats.parsedMoves++;
        continue;
      }
      if (cmd === 'M107') {
        this.moves.push({ cmd: 'M107', fanSpeed: 0 });
        this.stats.parsedMoves++;
        continue;
      }

      // ── Motion parameter commands ─────────────────────────────────────────
      if (cmd === 'M204') {
        const move = { cmd: 'M204' };
        if (params.S !== undefined) move.printAccel = params.S;
        if (params.P !== undefined) move.printAccel = params.P;
        if (params.T !== undefined) move.travelAccel = params.T;
        this.moves.push(move);
        this.stats.parsedMoves++;
        continue;
      }
      if (cmd === 'M205') {
        const move = { cmd: 'M205' };
        if (params.X !== undefined) move.jerkX = params.X;
        if (params.Y !== undefined) move.jerkY = params.Y;
        if (params.Z !== undefined) move.jerkZ = params.Z;
        if (params.E !== undefined) move.jerkE = params.E;
        this.moves.push(move);
        this.stats.parsedMoves++;
        continue;
      }
      if (cmd === 'M220') {
        this.moves.push({ cmd: 'M220', speedPct: params.S ?? 100 });
        this.stats.parsedMoves++;
        continue;
      }
      if (cmd === 'M221') {
        this.moves.push({ cmd: 'M221', flowPct: params.S ?? 100 });
        this.stats.parsedMoves++;
        continue;
      }

      // ── Pause ─────────────────────────────────────────────────────────────
      if (cmd === 'M0' || cmd === 'M1') {
        this.moves.push({ cmd, pause: true });
        this.stats.parsedMoves++;
        continue;
      }

      // ── M900: Linear advance ──────────────────────────────────────────────
      if (cmd === 'M900') {
        if (params.K !== undefined) this.stats.linearAdvanceK = params.K;
        continue;
      }

      // ── M84 / M18: Disable steppers ──────────────────────────────────────
      if (cmd === 'M84' || cmd === 'M18') {
        this.moves.push({ cmd: 'M84' });
        this.stats.parsedMoves++;
        continue;
      }

      this.stats.skipped++;
    }

    console.log(
      `G-code parsed: ${this.stats.parsedMoves} moves, ` +
      `${this.stats.layers} layers, ` +
      `${this.stats.estimatedFilament.toFixed(1)} mm filament`,
    );
    return this;
  }

  // ── Metadata comment parser ─────────────────────────────────────────────────

  /**
   * Extracts slicer metadata embedded in comment lines and emits pseudo-
   * commands (SET_HEIGHT, SET_WIDTH, SET_LAYER, SET_TYPE) into the move list.
   *
   * @param {string} commentLine  The full line starting with ';'.
   */
  _parseMetaComment(commentLine) {
    // ;HEIGHT:<n>
    let m = commentLine.match(/^;HEIGHT:([\d.]+)/i);
    if (m) {
      const h = parseFloat(m[1]);
      if (!isNaN(h)) this.moves.push({ cmd: 'SET_HEIGHT', value: h });
      return;
    }

    // ;WIDTH:<n>
    m = commentLine.match(/^;WIDTH:([\d.]+)/i);
    if (m) {
      const w = parseFloat(m[1]);
      if (!isNaN(w)) this.moves.push({ cmd: 'SET_WIDTH', value: w });
      return;
    }

    // ;LAYER:<n>  (Cura) or ;LAYER_CHANGE (PrusaSlicer)
    m = commentLine.match(/^;LAYER:(\d+)/i);
    if (m) {
      this.stats.currentLayer = parseInt(m[1], 10);
      this.moves.push({ cmd: 'SET_LAYER', value: this.stats.currentLayer });
      return;
    }

    // ;TYPE:<segment-type>  e.g. WALL-INNER, FILL, SUPPORT, SKIRT
    m = commentLine.match(/^;TYPE:(.+)/i);
    if (m) {
      this.moves.push({ cmd: 'SET_TYPE', value: m[1].trim() });
      return;
    }

    // ;LAYER_COUNT:<n>
    m = commentLine.match(/^;LAYER_COUNT:(\d+)/i);
    if (m) { this.stats.totalLayers = parseInt(m[1], 10); return; }

    // ;TIME:<s>  — estimated print time in seconds
    m = commentLine.match(/^;TIME:(\d+)/i);
    if (m) { this.stats.estimatedTimeSec = parseInt(m[1], 10); return; }

    // ;Filament used: <n> m
    m = commentLine.match(/;Filament used:\s*([\d.]+)\s*m/i);
    if (m) { this.stats.slicerFilamentM = parseFloat(m[1]); return; }
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────────

  /** Prints a rich parse summary to the console. */
  summary() {
    const s = this.stats;
    const hh = Math.floor((s.estimatedTimeSec ?? 0) / 3600);
    const mm = Math.floor(((s.estimatedTimeSec ?? 0) % 3600) / 60);
    const ss = (s.estimatedTimeSec ?? 0) % 60;

    console.log('\n========== G-CODE SUMMARY ==========');
    console.log(`   Total lines    : ${s.totalLines}`);
    console.log(`   Parsed moves   : ${s.parsedMoves}`);
    console.log(`   Skipped lines  : ${s.skipped}`);
    console.log(`   Layers         : ${s.layers}${s.totalLayers ? ' / ' + s.totalLayers : ''}`);
    console.log(`   Hotend temp    : ${s.hotendTemp ?? 'not set'} °C`);
    console.log(`   Bed temp       : ${s.bedTemp ?? 'not set'} °C`);
    console.log(`   Est. filament  : ${s.estimatedFilament.toFixed(1)} mm` +
      (s.slicerFilamentM ? `  (slicer: ${(s.slicerFilamentM * 1000).toFixed(0)} mm)` : ''));
    if (s.estimatedTimeSec) {
      console.log(`   Est. time      : ${hh}h ${mm}m ${ss}s`);
    }
    if (s.linearAdvanceK !== null) {
      console.log(`   Linear advance : K=${s.linearAdvanceK}`);
    }
    console.log('=====================================\n');
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Parses parameter tokens after the command into a map.
 *   ['G1', 'X10.5', 'Y-3', 'F1800'] → { X: 10.5, Y: -3, F: 1800 }
 *
 * @param {string[]} tokens
 * @returns {Record<string, number>}
 */
function _parseParams(tokens) {
  const params = {};
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.length < 2) continue;
    const letter = tok[0];
    const val = parseFloat(tok.slice(1));
    if (!isNaN(val)) params[letter] = val;
  }
  return params;
}

/**
 * Returns a zeroed stats object.
 * @returns {object}
 */
function _emptyStats() {
  return {
    totalLines: 0,
    parsedMoves: 0,
    skipped: 0,
    layers: 0,
    totalLayers: 0,
    currentLayer: 0,
    hotendTemp: null,
    bedTemp: null,
    estimatedFilament: 0,
    estimatedTimeSec: null,
    slicerFilamentM: null,
    linearAdvanceK: null,
  };
}

/**
 * Linearises a G2/G3 arc into a sequence of short G1 straight segments.
 * Uses the I/J centre offsets (R radius arcs are not yet supported).
 *
 * @param {number}  x0, y0, z0, e0   Current machine position
 * @param {object}  params            Parsed parameters { X, Y, Z, I, J, E, F }
 * @param {boolean} ccw               true = G3 (counter-clockwise)
 * @param {boolean} absPos            Absolute XY mode
 * @param {boolean} absE              Absolute E mode
 * @param {boolean} inchMode
 * @param {number}  currentF
 * @returns {Array<object>}  Array of G1 move objects
 */
function _lineariseArc(x0, y0, z0, e0, params, ccw, absPos, absE, inchMode, currentF) {
  const toMm = (v) => (inchMode ? v * 25.4 : v);

  const F = params.F ?? currentF;
  const x1 = absPos ? (params.X !== undefined ? toMm(params.X) : x0) : x0 + toMm(params.X ?? 0);
  const y1 = absPos ? (params.Y !== undefined ? toMm(params.Y) : y0) : y0 + toMm(params.Y ?? 0);
  const z1 = params.Z !== undefined ? (absPos ? toMm(params.Z) : z0 + toMm(params.Z)) : z0;
  const eEnd = params.E !== undefined
    ? (absE ? toMm(params.E) : e0 + toMm(params.E))
    : undefined;

  // Centre of arc
  const cx = x0 + toMm(params.I ?? 0);
  const cy = y0 + toMm(params.J ?? 0);

  const r = Math.hypot(x0 - cx, y0 - cy);
  let aStart = Math.atan2(y0 - cy, x0 - cx);
  let aEnd = Math.atan2(y1 - cy, x1 - cx);

  if (ccw && aEnd <= aStart) aEnd += 2 * Math.PI;
  if (!ccw && aEnd >= aStart) aEnd -= 2 * Math.PI;

  const arcLen = Math.abs(aEnd - aStart) * r;
  const segments = Math.max(4, Math.ceil(arcLen / 1));  // ~1 mm per segment
  const moves = [];
  let eTrack = e0;

  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const angle = aStart + (aEnd - aStart) * t;
    const mx = cx + r * Math.cos(angle);
    const my = cy + r * Math.sin(angle);
    const mz = z0 + (z1 - z0) * t;

    const move = { cmd: 'G1', X: mx, Y: my, Z: mz, F };

    if (eEnd !== undefined) {
      const eVal = e0 + (eEnd - e0) * t;
      move.E = eVal;
      eTrack = eVal;
    }

    moves.push(move);
  }

  return moves;
}
