// printing_motion.js

/**
 * PrintingMotion
 *
 * Accepts a move list in G-code-style format and executes it on the three axes.
 *
 * ─── Coordinate system ────────────────────────────────────────────────────
 *  G-code works in mm, with 0,0 at the bed front-left corner.
 *  The bed size (Tisch) is read from the Y-axis at init time.
 *  G-code X mm → mapped proportionally to xAxis.maxTravel
 *  G-code Y mm → mapped proportionally to yAxis.maxTravel
 *  G-code Z mm → mapped proportionally to zAxis.maxTravel
 *
 *  This means: if the bed is 300×300mm and maxTravel is 300, the mapping
 *  is 1:1. If the model's bed is a different size, it scales automatically.
 *
 * ─── Supported commands ───────────────────────────────────────────────────
 *  G0  { X, Y, Z, F }   — rapid move (no extrusion)
 *  G1  { X, Y, Z, F }   — print move (with extrusion)
 *  G28 { X?, Y?, Z? }   — home specified axes (no args = home all)
 *  G92 { X?, Y?, Z? }   — set current position as offset (position reset)
 *
 *  F (feedrate mm/min) persists across moves — just like a real printer.
 *  Omitted X/Y/Z in a move means "stay at current position on that axis".
 *
 * ─── Move list format ─────────────────────────────────────────────────────
 *  Each entry is a plain object:
 *  { cmd: 'G1', X: 100, Y: 50, Z: 0.2, F: 3000 }
 *  { cmd: 'G28' }
 *  { cmd: 'G92', Z: 0 }
 *
 * ─── Backward compatibility ───────────────────────────────────────────────
 *  generateSquarePath() and generateCirclePath() still work — they now
 *  build a G-code move list internally and call loadMoves().
 *  loadCustomPath() is kept as an alias for loadMoves() with raw {x,y,z,speed}.
 */
export class PrintingMotion {

    /**
     * @param {XAxisMotion} xAxis
     * @param {YAxisMotion} yAxis
     * @param {ZAxisMotion} zAxis
     * @param {object}      bedDimensions  Optional override. If omitted, read from yAxis.
     *                                     { width: mm, depth: mm }
     */
    constructor(xAxis, yAxis, zAxis, bedDimensions = null) {
        this.xAxis = xAxis;
        this.yAxis = yAxis;
        this.zAxis = zAxis;

        // ── Internal move list (G-code style objects) ──────────────────────
        this.moves       = [];
        this._moveIndex  = 0;

        // ── Runtime state ──────────────────────────────────────────────────
        this.isRunning     = false;
        this.currentF      = 1800;   // mm/min — default feedrate (30 mm/s)
        this.defaultSpeed  = 50;     // mm/s fallback if F never set

        // G92 offsets — added to every target position
        this._offsetX = 0;
        this._offsetY = 0;
        this._offsetZ = 0;

        // ── Bed coordinate space ───────────────────────────────────────────
        // Read bed dimensions from Y-axis (Tisch bounding box) or use override
        this.bedWidth = 300;  // mm — X direction
        this.bedDepth = 300;  // mm — Y direction
        this._initBedDimensions(bedDimensions);

        // ── Visualisation ──────────────────────────────────────────────────
        this._pathMesh = null;
        this.stats     = null;

        // ── Legacy: keep path[] in sync for visualizePath() ───────────────
        this.path = [];

        console.log('🖨️  PrintingMotion ready.');
        console.log(`   Bed: ${this.bedWidth}×${this.bedDepth}mm`);
        console.log(`   Axis maxTravel: X=${xAxis.maxTravel} Y=${yAxis.maxTravel} Z=${zAxis.maxTravel}`);
    }

    // ─── Bed Initialisation ───────────────────────────────────────────────────

    _initBedDimensions(override) {
        if (override) {
            this.bedWidth = override.width;
            this.bedDepth = override.depth;
            return;
        }

        // Try to read from Y-axis if it exposes bed dimensions
        if (this.yAxis && typeof this.yAxis.logTischDimensions === 'function') {
            const dims = this.yAxis.logTischDimensions();
            if (dims && dims.original) {
                // logTischDimensions returns original mm dimensions
                this.bedWidth = dims.original.width  || this.bedWidth;
                this.bedDepth = dims.original.depth  || this.bedDepth;
                console.log(`   Bed dimensions read from Tisch: ${this.bedWidth.toFixed(1)}×${this.bedDepth.toFixed(1)}mm`);
                return;
            }
        }

        console.log(`   Bed dimensions: using defaults ${this.bedWidth}×${this.bedDepth}mm`);
    }

    // ─── Coordinate Mapping ───────────────────────────────────────────────────

    /**
     * Map G-code X mm (0 … bedWidth)  → axis position (0 … xAxis.maxTravel)
     * Clamps to valid range automatically.
     */
    _mapX(gcodeX) {
        const x = (gcodeX / this.bedWidth) * this.xAxis.maxTravel;
        return Math.max(0, Math.min(x, this.xAxis.maxTravel));
    }

    _mapY(gcodeY) {
        const y = (gcodeY / this.bedDepth) * this.yAxis.maxTravel;
        return Math.max(0, Math.min(y, this.yAxis.maxTravel));
    }

    _mapZ(gcodeZ) {
        const z = (gcodeZ / this.zAxis.maxTravel) * this.zAxis.maxTravel;
        return Math.max(0, Math.min(z, this.zAxis.maxTravel));
    }

    // ─── Move List Loading ────────────────────────────────────────────────────

    /**
     * Load a G-code-style move list.
     * Each entry: { cmd, X, Y, Z, F }
     * cmd: 'G0' | 'G1' | 'G28' | 'G92'
     *
     * @param {Array<object>} moveList
     * @returns {PrintingMotion} this — for chaining
     */
    loadMoves(moveList) {
        this.moves = moveList.map(m => ({ ...m }));
        // Keep legacy this.path in sync (for visualizePath)
        this._syncLegacyPath();
        console.log(`📂 Loaded ${this.moves.length} moves`);
        return this;
    }

    /**
     * Backward-compatible: accepts raw { x, y, z, speed } objects.
     * Converts to G1 move list internally.
     */
    loadCustomPath(moves) {
        const converted = moves.map(m => ({
            cmd: 'G1',
            X:   m.x     ?? 0,
            Y:   m.y     ?? 0,
            Z:   m.z     ?? 0,
            F:   m.speed != null ? m.speed * 60 : this.currentF   // mm/s → mm/min
        }));
        return this.loadMoves(converted);
    }

    // ─── Path Generators (backward compatible) ────────────────────────────────

    generateSquarePath(startX = 50, startY = 50, size = 20, layers = 1, speed = this.defaultSpeed) {
        const F = speed * 60;
        const moves = [];

        for (let layer = 0; layer < layers; layer++) {
            const z = layer * 0.2;

            if (layer > 0) {
                moves.push({ cmd: 'G0', X: startX, Y: startY, Z: z + 1, F: F * 2 });
            }

            moves.push({ cmd: 'G1', X: startX,        Y: startY,        Z: z, F });
            moves.push({ cmd: 'G1', X: startX + size, Y: startY,        Z: z, F });
            moves.push({ cmd: 'G1', X: startX + size, Y: startY + size, Z: z, F });
            moves.push({ cmd: 'G1', X: startX,        Y: startY + size, Z: z, F });
            moves.push({ cmd: 'G1', X: startX,        Y: startY,        Z: z, F });
        }

        this.loadMoves(moves);
        console.log(`📐 Square path: origin=(${startX},${startY}) size=${size}mm layers=${layers} moves=${moves.length}`);
        return this;
    }

    generateCirclePath(cx = 100, cy = 100, radius = 20, layers = 1, segments = 36, speed = this.defaultSpeed) {
        const F = speed * 60;
        const moves = [];

        for (let layer = 0; layer < layers; layer++) {
            const z = layer * 0.2;

            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                moves.push({
                    cmd: 'G1',
                    X: cx + Math.cos(angle) * radius,
                    Y: cy + Math.sin(angle) * radius,
                    Z: z,
                    F
                });
            }
        }

        this.loadMoves(moves);
        console.log(`⭕ Circle path: centre=(${cx},${cy}) r=${radius}mm layers=${layers} moves=${moves.length}`);
        return this;
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    /**
     * Execute the loaded move list.
     * Processes G0, G1, G28, G92 commands in order.
     */
    async executePath() {
        if (this.moves.length === 0) {
            console.warn('⚠️  No moves loaded. Call loadMoves() or a generator first.');
            return;
        }
        if (this.isRunning) {
            console.warn('⚠️  Already running. Call stop() first.');
            return;
        }

        this.isRunning   = true;
        this._moveIndex  = 0;
        this._offsetX    = 0;
        this._offsetY    = 0;
        this._offsetZ    = 0;

        const startTime = Date.now();
        console.log(`▶️  Executing ${this.moves.length} moves…`);

        // Track current logical position (in G-code mm, before mapping)
        let curX = 0, curY = 0, curZ = 0;

        for (let i = 0; i < this.moves.length; i++) {
            if (!this.isRunning) break;

            this._moveIndex = i;
            const move = this.moves[i];
            const cmd  = (move.cmd || 'G1').toUpperCase();

            // ── G28: Home ──────────────────────────────────────────────────
            if (cmd === 'G28') {
                const homeX = move.X !== undefined;
                const homeY = move.Y !== undefined;
                const homeZ = move.Z !== undefined;
                const homeAll = !homeX && !homeY && !homeZ;

                const dur = 800;
                if (homeAll || homeX) { this.xAxis.moveToPosition(0, dur); curX = 0; }
                if (homeAll || homeY) { this.yAxis.moveToPosition(0, dur); curY = 0; }
                if (homeAll || homeZ) { this.zAxis.moveToPosition(0, dur); curZ = 0; }

                await this._delay(dur + 100);
                console.log(`🏠 G28 — homed ${homeAll ? 'all' : [homeX&&'X', homeY&&'Y', homeZ&&'Z'].filter(Boolean).join('')}`);
                continue;
            }

            // ── G92: Set position (offset reset) ──────────────────────────
            if (cmd === 'G92') {
                // G92 X0 means "current position IS X=0" — store as offset
                if (move.X !== undefined) { this._offsetX = curX - move.X; curX = move.X; }
                if (move.Y !== undefined) { this._offsetY = curY - move.Y; curY = move.Y; }
                if (move.Z !== undefined) { this._offsetZ = curZ - move.Z; curZ = move.Z; }
                console.log(`📌 G92 — offsets: X=${this._offsetX.toFixed(2)} Y=${this._offsetY.toFixed(2)} Z=${this._offsetZ.toFixed(2)}`);
                continue;
            }

            // ── G0 / G1: Move ─────────────────────────────────────────────
            if (cmd === 'G0' || cmd === 'G1') {
                // Update feedrate if provided (F persists)
                if (move.F !== undefined) this.currentF = move.F;

                // Target in G-code mm (use current if axis not specified)
                const targX = (move.X !== undefined ? move.X : curX);
                const targY = (move.Y !== undefined ? move.Y : curY);
                const targZ = (move.Z !== undefined ? move.Z : curZ);

                // Apply G92 offsets
                const adjX = targX + this._offsetX;
                const adjY = targY + this._offsetY;
                const adjZ = targZ + this._offsetZ;

                // Map G-code mm → axis positions
                const axisX = this._mapX(adjX);
                const axisY = this._mapY(adjY);
                const axisZ = this._mapZ(adjZ);

                // Duration from feedrate (mm/min → mm/s → ms)
                const speedMmS = this.currentF / 60;
                const dx = adjX - (curX + this._offsetX);
                const dy = adjY - (curY + this._offsetY);
                const dz = adjZ - (curZ + this._offsetZ);
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const duration = Math.max(50, (dist / speedMmS) * 1000);

                // Execute
                this.xAxis.moveToPosition(axisX, duration);
                this.yAxis.moveToPosition(axisY, duration);
                this.zAxis.moveToPosition(axisZ, duration);

                await this._delay(duration);

                curX = targX;
                curY = targY;
                curZ = targZ;
                continue;
            }

            // Unknown command — skip silently
            console.log(`⏭️  Skipping unknown command: ${cmd}`);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        this.isRunning  = false;
        this._moveIndex = 0;

        this.stats = { moves: this.moves.length, elapsedSeconds: parseFloat(elapsed) };
        console.log(`✅ Done: ${this.moves.length} moves in ${elapsed}s`);
    }

    stop() {
        if (!this.isRunning) { console.log('ℹ️  Not running.'); return; }
        this.isRunning = false;
        console.log('⏹️  Stopped at move', this._moveIndex);
    }

    // ─── Visualisation ────────────────────────────────────────────────────────

    visualizePath(scene, mmToScene = 0.1, color = 0x00ff88) {
        if (!scene) { console.warn('⚠️  Pass scene as first argument.'); return; }
        if (this.path.length < 2) { console.warn('⚠️  Need at least 2 points.'); return; }

        import('three').then(({ BufferGeometry, BufferAttribute, LineBasicMaterial, Line }) => {
            if (this._pathMesh) {
                scene.remove(this._pathMesh);
                this._pathMesh.geometry.dispose();
                this._pathMesh = null;
            }

            const positions = new Float32Array(this.path.length * 3);
            this.path.forEach((pt, i) => {
                positions[i * 3 + 0] = pt.x * mmToScene;
                positions[i * 3 + 1] = pt.z * mmToScene;
                positions[i * 3 + 2] = pt.y * mmToScene;
            });

            const geometry = new BufferGeometry();
            geometry.setAttribute('position', new BufferAttribute(positions, 3));
            this._pathMesh = new Line(geometry, new LineBasicMaterial({ color, linewidth: 2 }));
            scene.add(this._pathMesh);

            console.log(`🎨 Path visualised (${this.path.length} points)`);
        });

        return this;
    }

    clearVisualization(scene) {
        if (this._pathMesh && scene) {
            scene.remove(this._pathMesh);
            this._pathMesh.geometry.dispose();
            this._pathMesh = null;
            console.log('🗑️  Visualisation cleared.');
        }
    }

    // ─── Status ───────────────────────────────────────────────────────────────

    getStatus() {
        return {
            isRunning:   this.isRunning,
            totalMoves:  this.moves.length,
            currentMove: this._moveIndex,
            progress:    this.moves.length > 0
                            ? ((this._moveIndex / this.moves.length) * 100).toFixed(1) + '%'
                            : '0%',
            feedrateMmMin: this.currentF,
            positions: {
                x: this.xAxis.getPosition(),
                y: this.yAxis.getPosition(),
                z: this.zAxis.getPosition()
            },
            lastStats: this.stats
        };
    }

    printStatus() {
        const s = this.getStatus();
        console.log('\n========== PRINTING STATUS ==========');
        console.log(`▶️  Running:    ${s.isRunning}`);
        console.log(`📍 Progress:   move ${s.currentMove} / ${s.totalMoves}  (${s.progress})`);
        console.log(`⚡ Feedrate:   ${s.feedrateMmMin} mm/min  (${(s.feedrateMmMin/60).toFixed(1)} mm/s)`);
        console.log(`📐 Position:   X=${s.positions.x.toFixed(2)}  Y=${s.positions.y.toFixed(2)}  Z=${s.positions.z.toFixed(2)}`);
        if (s.lastStats) console.log(`✅ Last run:   ${s.lastStats.moves} moves in ${s.lastStats.elapsedSeconds}s`);
        console.log('=====================================\n');
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    /**
     * Keep the legacy this.path[] array in sync with the move list
     * so visualizePath() still works without changes.
     */
    _syncLegacyPath() {
        this.path = this.moves
            .filter(m => m.cmd === 'G0' || m.cmd === 'G1')
            .map(m => ({
                x: m.X ?? 0,
                y: m.Y ?? 0,
                z: m.Z ?? 0
            }));
    }

    // kept for backward compat (generateSquarePath etc used this before)
    _addMove(x, y, z, speed) {
        this.moves.push({ cmd: 'G1', X: x, Y: y, Z: z, F: (speed ?? this.defaultSpeed) * 60 });
        this.path.push({ x, y, z });
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async _homeAll() {
        const dur = 800;
        this.xAxis.moveToPosition(0, dur);
        this.yAxis.moveToPosition(0, dur);
        this.zAxis.moveToPosition(0, dur);
        await this._delay(dur + 100);
        console.log('🏠 All axes homed.');
    }
}