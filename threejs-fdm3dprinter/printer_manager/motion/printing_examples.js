// printing_examples.js
import { GCodeLoader } from './gcode_loader.js';

import * as THREE from 'three';

export class PrintingExamples {

    constructor() {
        console.log('🖨️  PrintingExamples ready. Available methods:');
        console.log('   examples.square()              — 2-layer square');
        console.log('   examples.circle()              — 2-layer circle');
        console.log('   examples.manualMoves()         — raw G-code move list');
        console.log('   examples.fromString(gcode)     — parse a G-code string');
        console.log('   examples.fromURL(url)          — load a .gcode file by URL');
        console.log('   examples.placement("corner")   — G-code 0,0 = bed front-left (default)');
        console.log('   examples.placement("center")   — G-code 0,0 = bed center');
        console.log('   examples.status()              — print current status');
        console.log('   examples.stop()                — stop current print');
        console.log('   examples.clear()               — clear path visualization');
    }

    // Resolved at call time — never at construction time
    get _printer() {
        if (!window.printer) throw new Error('window.printer not ready yet — wait for the model to load');
        return window.printer;
    }

    get _scene() {
        if (!window.scene) throw new Error('window.scene not found — make sure scene is exposed as window.scene in main.js');
        return window.scene;
    }

    // ─── Built-in generators ─────────────────────────────────────────────────

    square(startX = 50, startY = 50, size = 100, layers = 2) {
        this._printer.generateSquarePath(startX, startY, size, layers);
        this._printer.startLiveVisualization(this._scene);
        this._printer.executePath();
    }

    circle(cx = 150, cy = 150, radius = 60, layers = 2) {
        this._printer.generateCirclePath(cx, cy, radius, layers);
        this._printer.startLiveVisualization(this._scene);
        this._printer.executePath();
    }

    // ─── Manual move list ─────────────────────────────────────────────────────

    manualMoves() {
        this._printer.loadMoves([
            { cmd: 'G28' },
            { cmd: 'G92', Z: 0 },
            { cmd: 'G0', X: 50,  Y: 50,  Z: 5,   F: 6000 },
            { cmd: 'G1', X: 50,  Y: 50,  Z: 0.2, F: 1800 },
            { cmd: 'G1', X: 150, Y: 50,  Z: 0.2, F: 1800 },
            { cmd: 'G1', X: 150, Y: 150, Z: 0.2, F: 1800 },
            { cmd: 'G1', X: 50,  Y: 150, Z: 0.2, F: 1800 },
            { cmd: 'G1', X: 50,  Y: 50,  Z: 0.2, F: 1800 },
            { cmd: 'G0', X: 50,  Y: 50,  Z: 1,   F: 6000 },
            { cmd: 'G1', X: 50,  Y: 50,  Z: 0.4, F: 1800 },
            { cmd: 'G1', X: 150, Y: 50,  Z: 0.4, F: 1800 },
            { cmd: 'G1', X: 150, Y: 150, Z: 0.4, F: 1800 },
            { cmd: 'G1', X: 50,  Y: 150, Z: 0.4, F: 1800 },
            { cmd: 'G1', X: 50,  Y: 50,  Z: 0.4, F: 1800 },
            { cmd: 'G28' },
        ]);

        this._printer.startLiveVisualization(this._scene);
        this._printer.executePath();
    }

    // ─── G-code string ────────────────────────────────────────────────────────

    fromString(gcode = null) {
        const defaultGcode = `
G28
G92 E0
G1 Z5 F3000
G1 X50 Y50 Z0.2 F1800
G1 X150 Y50 F1800
G1 X150 Y150 F1800
G1 X50 Y150 F1800
G1 X50 Y50 F1800
G0 Z1 F6000
G1 X50 Y50 Z0.4 F1800
G1 X150 Y50 F1800
G1 X150 Y150 F1800
G1 X50 Y150 F1800
G1 X50 Y50 F1800
G28
        `.trim();

        const loader = new GCodeLoader();
        loader.parse(gcode ?? defaultGcode);
        loader.summary();

        this._printer.loadMoves(loader.moves);
        this._printer.startLiveVisualization(this._scene);
        this._printer.executePath();
    }

    // ─── From URL ─────────────────────────────────────────────────────────────

    fromURL(url = 'models/Jellyfish_Fidget.gcode') {
        const loader = new GCodeLoader();
        loader.loadFromURL(url)
            .then(() => {
                loader.summary();
                this._printer.loadMoves(loader.moves);
                this._printer.startLiveVisualization(this._scene);
                this._printer.executePath();
            })
            .catch(err => console.error('❌ Failed to load G-code:', err.message));
    }

    // ─── Calibration Tests ───────────────────────────────────────────────────

    /**
     * Print a calibration tower — a hollow square that grows in Z layer by layer.
     * Purpose: verify X moves left/right correctly, Y moves bed correctly,
     *          Z lifts the gantry correctly, and layers stack cleanly.
     *
     * The tower is centered on the bed (uses current placement setting).
     * Default: 40mm square, 10 layers, 0.3mm layer height.
     *
     * Watch for:
     *   ✓ Square walls stay aligned layer to layer → X and Y are correct
     *   ✓ Each layer sits above the previous → Z is correct
     *   ✗ Walls drift sideways → X or Y limit/offset is wrong
     *   ✗ Layers collapse into one plane → Z not moving
     *   ✗ Square is rectangular → X and Y scales differ
     */
    tower(cx = 150, cy = 150, size = 40, layers = 10, layerHeight = 0.3, speed = 40) {
        const half = size / 2;
        const F    = speed * 60;
        const moves = [];

        // Home and lift before starting
        moves.push({ cmd: 'G28' });
        moves.push({ cmd: 'G0', X: cx, Y: cy, Z: 5, F: F * 2 });

        for (let layer = 0; layer < layers; layer++) {
            const z = (layer + 1) * layerHeight;

            // Drop to layer height
            moves.push({ cmd: 'G0', X: cx - half, Y: cy - half, Z: z, F: F * 2 });

            // Print one perimeter square
            moves.push({ cmd: 'G1', X: cx + half, Y: cy - half, Z: z, F });
            moves.push({ cmd: 'G1', X: cx + half, Y: cy + half, Z: z, F });
            moves.push({ cmd: 'G1', X: cx - half, Y: cy + half, Z: z, F });
            moves.push({ cmd: 'G1', X: cx - half, Y: cy - half, Z: z, F });
        }

        // Home when done
        moves.push({ cmd: 'G28' });

        console.log(`🗼 Tower: center=(${cx},${cy}) size=${size}mm layers=${layers} layerHeight=${layerHeight}mm`);
        console.log(`   Total moves: ${moves.length}`);
        console.log(`   Expected height: ${(layers * layerHeight).toFixed(2)}mm`);

        this._printer.loadMoves(moves);
        this._printer.startLiveVisualization(this._scene);
        this._printer.executePath();
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    status() { this._printer.printStatus(); }
    stop()   { this._printer.stop(); }
    clear()  { this._printer.clearLiveVisualization(); }

    /**
     * Switch placement mode and log current setting.
     * 'corner' — G-code 0,0 maps to front-left corner of bed (slicer default)
     * 'center' — G-code 0,0 maps to bed center
     * Takes effect on the next print — call before startLiveVisualization.
     */
    placement(mode) {
        if (mode !== 'corner' && mode !== 'center') {
            console.warn('placement: use "corner" or "center"');
            return;
        }
        this._printer.placement = mode;
        console.log(`📐 Placement set to: ${mode}`);
    }


    // where is Tisch and where is nozzle
    where() {
        // Check where Tisch actually is right now
const t = modelLoader.findPartByName('Tisch')
t.updateWorldMatrix(true, true)
const b = new THREE.Box3().setFromObject(t)
console.log('Tisch world min:', b.min)
console.log('Tisch world max:', b.max)
console.log('Tisch world center:', b.min.clone().add(b.max).multiplyScalar(0.5))

// Check where nozzle is
const n = modelLoader.findPartByName('Druckkopf')
n.updateWorldMatrix(true, true)
const nb = new THREE.Box3().setFromObject(n)
console.log('Nozzle world bottom:', nb.min.y)
    }
}