// printing_motion.js
export class PrintingMotion {

    constructor(xAxis, yAxis, zAxis) {
        this.xAxis = xAxis;
        this.yAxis = yAxis;
        this.zAxis = zAxis;

        this.path = [];
        this._pathIndex = 0;
        this.defaultSpeed = 50;
        this.layerHeight = 0.2;
        this.isRunning = false;
        this._pathMesh = null;
        this.stats = null;

        console.log('🖨️  PrintingMotion ready. Axes connected:', {
            x: !!xAxis, y: !!yAxis, z: !!zAxis
        });
    }

    // ─── Path Generators ─────────────────────────────────────────────────────

    generateSquarePath(startX = 50, startY = 50, size = 20, layers = 1, speed = this.defaultSpeed) {
        this.path = [];

        for (let layer = 0; layer < layers; layer++) {
            const z = layer * this.layerHeight;

            if (layer > 0) {
                this._addMove(startX, startY, z + 1, speed * 2);
            }

            this._addMove(startX,        startY,        z, speed);
            this._addMove(startX + size, startY,        z, speed);
            this._addMove(startX + size, startY + size, z, speed);
            this._addMove(startX,        startY + size, z, speed);
            this._addMove(startX,        startY,        z, speed);
        }

        console.log(`📐 Square path: origin=(${startX},${startY}) size=${size}mm layers=${layers} moves=${this.path.length}`);
        return this;
    }

    generateCirclePath(cx = 100, cy = 100, radius = 20, layers = 1, segments = 36, speed = this.defaultSpeed) {
        this.path = [];

        for (let layer = 0; layer < layers; layer++) {
            const z = layer * this.layerHeight;

            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x = cx + Math.cos(angle) * radius;
                const y = cy + Math.sin(angle) * radius;
                this._addMove(x, y, z, speed);
            }
        }

        console.log(`⭕ Circle path: centre=(${cx},${cy}) r=${radius}mm layers=${layers} moves=${this.path.length}`);
        return this;
    }

    loadCustomPath(moves) {
        this.path = moves.map(m => ({
            x:     m.x     ?? 0,
            y:     m.y     ?? 0,
            z:     m.z     ?? 0,
            speed: m.speed ?? this.defaultSpeed
        }));
        console.log(`📂 Custom path loaded: ${this.path.length} moves`);
        return this;
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    async executePath() {
        if (this.path.length === 0) {
            console.warn('⚠️  No path set. Call generateSquarePath() or loadCustomPath() first.');
            return;
        }
        if (this.isRunning) {
            console.warn('⚠️  Already running. Call stop() first.');
            return;
        }

        this.isRunning = true;
        this._pathIndex = 0;
        const startTime = Date.now();

        console.log(`▶️  Executing path: ${this.path.length} moves…`);

        await this._homeAll();

        for (let i = 0; i < this.path.length; i++) {
            if (!this.isRunning) break;

            this._pathIndex = i;
            const move = this.path[i];

            const prevX = i === 0 ? 0 : this.path[i - 1].x;
            const prevY = i === 0 ? 0 : this.path[i - 1].y;
            const prevZ = i === 0 ? 0 : this.path[i - 1].z;

            const dx   = Math.abs(move.x - prevX);
            const dy   = Math.abs(move.y - prevY);
            const dz   = Math.abs(move.z - prevZ);
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const speed    = move.speed ?? this.defaultSpeed;
            const duration = Math.max(50, (dist / speed) * 1000);

            this.xAxis.moveToPosition(move.x, duration);
            this.yAxis.moveToPosition(move.y, duration);
            this.zAxis.moveToPosition(move.z, duration);

            await this._delay(duration);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        this.isRunning  = false;
        this._pathIndex = 0;

        this.stats = {
            moves:          this.path.length,
            elapsedSeconds: parseFloat(elapsed)
        };

        console.log(`✅ Path complete: ${this.path.length} moves in ${elapsed}s`);
    }

    stop() {
        if (!this.isRunning) {
            console.log('ℹ️  Not currently running.');
            return;
        }
        this.isRunning = false;
        console.log('⏹️  Stopped at move', this._pathIndex);
    }

    // ─── Visualisation ────────────────────────────────────────────────────────

    visualizePath(scene, mmToScene = 0.1, color = 0x00ff88) {
        if (!scene) {
            console.warn('⚠️  Pass the THREE.js scene as the first argument.');
            return;
        }
        if (this.path.length < 2) {
            console.warn('⚠️  Need at least 2 path points to visualise.');
            return;
        }

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

            const geometry  = new BufferGeometry();
            geometry.setAttribute('position', new BufferAttribute(positions, 3));

            const material = new LineBasicMaterial({ color, linewidth: 2 });
            this._pathMesh = new Line(geometry, material);
            scene.add(this._pathMesh);

            console.log(`🎨 Path visualised (${this.path.length} points, scale=${mmToScene})`);
        });

        return this;
    }

    clearVisualization(scene) {
        if (this._pathMesh && scene) {
            scene.remove(this._pathMesh);
            this._pathMesh.geometry.dispose();
            this._pathMesh = null;
            console.log('🗑️  Path visualisation cleared.');
        }
    }

    // ─── Status ───────────────────────────────────────────────────────────────

    getStatus() {
        return {
            isRunning:   this.isRunning,
            totalMoves:  this.path.length,
            currentMove: this._pathIndex,
            progress:    this.path.length > 0
                            ? ((this._pathIndex / this.path.length) * 100).toFixed(1) + '%'
                            : '0%',
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
        console.log(`▶️  Running:   ${s.isRunning}`);
        console.log(`📍 Progress:  move ${s.currentMove} / ${s.totalMoves}  (${s.progress})`);
        console.log(`📐 Position:  X=${s.positions.x.toFixed(2)}mm  Y=${s.positions.y.toFixed(2)}mm  Z=${s.positions.z.toFixed(2)}mm`);
        if (s.lastStats) {
            console.log(`✅ Last run:  ${s.lastStats.moves} moves in ${s.lastStats.elapsedSeconds}s`);
        }
        console.log('=====================================\n');
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    _addMove(x, y, z, speed) {
        this.path.push({ x, y, z, speed: speed ?? this.defaultSpeed });
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async _homeAll() {
        const homeDuration = 800;
        this.xAxis.moveToPosition(0, homeDuration);
        this.yAxis.moveToPosition(0, homeDuration);
        this.zAxis.moveToPosition(0, homeDuration);
        await this._delay(homeDuration + 100);
        console.log('🏠 All axes homed.');
    }
}