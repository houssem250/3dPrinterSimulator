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
        
        console.log('🖨️ PrintingMotion ready. Axes connected:', {
            x: !!xAxis, y: !!yAxis, z: !!zAxis
        });
    }

    async executePath() {
        if (this.path.length === 0) {
            console.warn('⚠️ No path set');
            return;
        }
        if (this.isRunning) {
            console.warn('⚠️ Already running');
            return;
        }

        this.isRunning = true;
        this._pathIndex = 0;
        const startTime = Date.now();

        console.log(`▶️ Executing path: ${this.path.length} moves`);

        // Home all axes
        await this._homeAll();

        for (let i = 0; i < this.path.length; i++) {
            if (!this.isRunning) break;

            this._pathIndex = i;
            const move = this.path[i];

            const prevX = i === 0 ? 0 : this.path[i - 1].x;
            const prevY = i === 0 ? 0 : this.path[i - 1].y;
            const prevZ = i === 0 ? 0 : this.path[i - 1].z;

            const dx = Math.abs(move.x - prevX);
            const dy = Math.abs(move.y - prevY);
            const dz = Math.abs(move.z - prevZ);
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const speed = move.speed ?? this.defaultSpeed;
            const duration = Math.max(50, (dist / speed) * 1000);

            // Move all axes simultaneously
            this.xAxis.moveToPosition(move.x, duration);
            this.yAxis.moveToPosition(move.y, duration);
            this.zAxis.moveToPosition(move.z, duration);

            // X follows Z if needed
            this.xAxis.followZ?.(move.z);

            await this._delay(duration);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        this.isRunning = false;
        this._pathIndex = 0;

        this.stats = {
            moves: this.path.length,
            elapsedSeconds: parseFloat(elapsed)
        };

        console.log(`✅ Path complete: ${this.path.length} moves in ${elapsed}s`);
    }

    async _homeAll() {
        const homeDuration = 800;
        this.xAxis.moveToPosition(0, homeDuration);
        this.yAxis.moveToPosition(0, homeDuration);
        this.zAxis.moveToPosition(0, homeDuration);
        await this._delay(homeDuration + 100);
        console.log('🏠 All axes homed');
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ... rest of the methods remain the same


    /** Return a promise that resolves after `ms` milliseconds */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Home all three axes and wait for them to arrive */
    async _homeAll() {
        const homeDuration = 800;
        this.xAxis.moveToPosition(0, homeDuration);
        this.yAxis.moveToPosition(0, homeDuration);
        this.zAxis.moveToPosition(0, homeDuration);
        await this._delay(homeDuration + 100);
        console.log('🏠 All axes homed.');
    }
}