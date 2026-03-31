// gcode_loader.js

/**
 * GCodeLoader
 *
 * Parses a .gcode file (text string or File object) into the move list
 * format that PrintingMotion.loadMoves() expects.
 *
 * ─── Supported commands ───────────────────────────────────────────────────
 *  G0        Rapid move
 *  G1        Print move
 *  G28       Home axes
 *  G90       Absolute positioning mode (default)
 *  G91       Relative positioning mode
 *  G92       Set position / reset extruder
 *  M82       Extruder absolute mode  (accepted, ignored)
 *  M83       Extruder relative mode  (accepted, ignored)
 *  M104/109  Set hotend temperature  (recorded in stats, not executed)
 *  M140/190  Set bed temperature     (recorded in stats, not executed)
 *  M106/107  Fan on/off              (recorded in stats, not executed)
 *  ;         Comment — stripped
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *  // From a <input type="file"> element:
 *  const loader = new GCodeLoader()
 *  await loader.loadFromFile(fileInputElement.files[0])
 *  printer.loadMoves(loader.moves)
 *  printer.executePath()
 *
 *  // From a URL:
 *  await loader.loadFromURL('models/test.gcode')
 *  printer.loadMoves(loader.moves)
 *
 *  // From a raw string:
 *  loader.parse(gcodeString)
 *  printer.loadMoves(loader.moves)
 *
 * ─── After parsing ────────────────────────────────────────────────────────
 *  loader.moves      Array of { cmd, X, Y, Z, F } — pass to loadMoves()
 *  loader.stats      { totalLines, parsedMoves, skipped, layers,
 *                      estimatedFilament, hotendTemp, bedTemp }
 *  loader.summary()  Prints stats to console
 */
export class GCodeLoader {

    constructor() {
        this.moves = [];
        this.stats = {
            totalLines:        0,
            parsedMoves:       0,
            skipped:           0,
            layers:            0,
            hotendTemp:        null,
            bedTemp:           null,
            estimatedFilament: 0,   // mm of filament (E values summed)
        };
    }

    // ─── Public Loaders ───────────────────────────────────────────────────────

    /**
     * Load from a browser File object (from <input type="file">).
     * @param {File} file
     * @returns {Promise<GCodeLoader>} this
     */
    loadFromFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) { reject(new Error('No file provided')); return; }

            const reader = new FileReader();
            reader.onload  = e => { this.parse(e.target.result); resolve(this); };
            reader.onerror = e => reject(new Error('File read error: ' + e));
            reader.readAsText(file);
        });
    }

    /**
     * Load from a URL (fetch).
     * @param {string} url
     * @returns {Promise<GCodeLoader>} this
     */
    async loadFromURL(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
        const text = await response.text();
        this.parse(text);
        return this;
    }

    /**
     * Parse a raw G-code string synchronously.
     * @param {string} text
     * @returns {GCodeLoader} this
     */
    parse(text) {
        // Reset state
        this.moves = [];
        this.stats = {
            totalLines: 0, parsedMoves: 0, skipped: 0,
            layers: 0, hotendTemp: null, bedTemp: null, estimatedFilament: 0
        };

        // Positioning mode: absolute (true) or relative (false)
        let absoluteMode = true;

        // Current logical position — used for relative mode calculation
        let curX = 0, curY = 0, curZ = 0, curE = 0;

        // Current layer tracking
        let lastZ = null;

        const lines = text.split('\n');
        this.stats.totalLines = lines.length;

        for (let rawLine of lines) {
            // Strip comments and whitespace
            const line = rawLine.split(';')[0].trim();
            if (!line) continue;

            // Tokenise — split on whitespace, uppercase
            const tokens = line.toUpperCase().split(/\s+/);
            const cmd    = tokens[0];

            // Parse all parameter tokens into a map: { X: 1.0, Y: 2.5, … }
            const params = {};
            for (let i = 1; i < tokens.length; i++) {
                const token = tokens[i];
                if (token.length < 2) continue;
                const key = token[0];
                const val = parseFloat(token.slice(1));
                if (!isNaN(val)) params[key] = val;
            }

            // ── G0 / G1 ───────────────────────────────────────────────────
            if (cmd === 'G0' || cmd === 'G1') {
                const move = { cmd };

                if (absoluteMode) {
                    // Absolute: use value directly, fall back to current
                    if (params.X !== undefined) { move.X = params.X; curX = params.X; }
                    if (params.Y !== undefined) { move.Y = params.Y; curY = params.Y; }
                    if (params.Z !== undefined) { move.Z = params.Z; curZ = params.Z; }
                } else {
                    // Relative: add delta to current position
                    if (params.X !== undefined) { curX += params.X; move.X = curX; }
                    if (params.Y !== undefined) { curY += params.Y; move.Y = curY; }
                    if (params.Z !== undefined) { curZ += params.Z; move.Z = curZ; }
                }

                if (params.F !== undefined) move.F = params.F;

                // Track extrusion for stats
                if (params.E !== undefined) {
                    const eDelta = absoluteMode
                        ? params.E - curE
                        : params.E;
                    if (eDelta > 0) this.stats.estimatedFilament += eDelta;
                    curE = absoluteMode ? params.E : curE + params.E;
                }

                // Track layer count on Z change
                if (move.Z !== undefined && move.Z !== lastZ) {
                    if (lastZ !== null) this.stats.layers++;
                    lastZ = move.Z;
                }

                this.moves.push(move);
                this.stats.parsedMoves++;
                continue;
            }

            // ── G28: Home ─────────────────────────────────────────────────
            if (cmd === 'G28') {
                const move = { cmd: 'G28' };
                // If specific axes given, record them
                if (params.X !== undefined) { move.X = 0; curX = 0; }
                if (params.Y !== undefined) { move.Y = 0; curY = 0; }
                if (params.Z !== undefined) { move.Z = 0; curZ = 0; }
                // No args = home all
                if (!Object.keys(params).length) { curX = 0; curY = 0; curZ = 0; }
                this.moves.push(move);
                this.stats.parsedMoves++;
                continue;
            }

            // ── G90: Absolute mode ────────────────────────────────────────
            if (cmd === 'G90') { absoluteMode = true;  continue; }

            // ── G91: Relative mode ────────────────────────────────────────
            if (cmd === 'G91') { absoluteMode = false; continue; }

            // ── G92: Set position ─────────────────────────────────────────
            if (cmd === 'G92') {
                const move = { cmd: 'G92' };
                if (params.X !== undefined) { move.X = params.X; curX = params.X; }
                if (params.Y !== undefined) { move.Y = params.Y; curY = params.Y; }
                if (params.Z !== undefined) { move.Z = params.Z; curZ = params.Z; }
                if (params.E !== undefined) { curE = params.E; }  // reset extruder only — not passed to motion
                // Only push if at least one spatial axis was set
                if (move.X !== undefined || move.Y !== undefined || move.Z !== undefined) {
                    this.moves.push(move);
                    this.stats.parsedMoves++;
                }
                continue;
            }

            // ── Temperature commands — record but do not execute ──────────
            if (cmd === 'M104' || cmd === 'M109') {
                if (params.S !== undefined) this.stats.hotendTemp = params.S;
                continue;
            }
            if (cmd === 'M140' || cmd === 'M190') {
                if (params.S !== undefined) this.stats.bedTemp = params.S;
                continue;
            }

            // ── Everything else — skip ────────────────────────────────────
            this.stats.skipped++;
        }

        console.log(`✅ G-code parsed: ${this.stats.parsedMoves} moves, ${this.stats.layers} layers`);
        return this;
    }

    // ─── Diagnostics ──────────────────────────────────────────────────────────

    summary() {
        const s = this.stats;
        console.log('\n========== G-CODE SUMMARY ==========');
        console.log(`📄 Total lines:      ${s.totalLines}`);
        console.log(`✅ Parsed moves:     ${s.parsedMoves}`);
        console.log(`⏭️  Skipped lines:   ${s.skipped}`);
        console.log(`📦 Layers detected:  ${s.layers}`);
        console.log(`🌡️  Hotend temp:     ${s.hotendTemp ?? 'not set'}°C`);
        console.log(`🛏️  Bed temp:        ${s.bedTemp    ?? 'not set'}°C`);
        console.log(`🧵 Est. filament:    ${s.estimatedFilament.toFixed(1)}mm`);
        console.log('=====================================\n');
    }
}