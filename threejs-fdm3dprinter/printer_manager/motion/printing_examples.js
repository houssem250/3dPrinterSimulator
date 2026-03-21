// printing_examples.js
import { GCodeLoader } from './gcode_loader.js';

export class PrintingExamples {

    constructor() {
        console.log('🖨️  PrintingExamples ready. Available methods:');
        console.log('   examples.square()           — 2-layer square');
        console.log('   examples.circle()           — 2-layer circle');
        console.log('   examples.manualMoves()      — raw G-code move list');
        console.log('   examples.fromString(gcode)  — parse a G-code string');
        console.log('   examples.fromURL(url)       — load a .gcode file by URL');
        console.log('   examples.status()           — print current status');
        console.log('   examples.stop()             — stop current print');
        console.log('   examples.clear()            — clear path visualization');
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
        this._printer.executePath().then(() => this._printer.visualizePath(this._scene));
    }

    circle(cx = 150, cy = 150, radius = 60, layers = 2) {
        this._printer.generateCirclePath(cx, cy, radius, layers);
        this._printer.executePath().then(() => this._printer.visualizePath(this._scene));
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

        this._printer.executePath().then(() => this._printer.visualizePath(this._scene));
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
        this._printer.executePath().then(() => this._printer.visualizePath(this._scene));
    }

    // ─── From URL ─────────────────────────────────────────────────────────────

    fromURL(url = 'models/Jellyfish_Fidget.gcode') {
        const loader = new GCodeLoader();
        loader.loadFromURL(url)
            .then(() => {
                loader.summary();
                this._printer.loadMoves(loader.moves);
                this._printer.executePath().then(() => this._printer.visualizePath(this._scene));
            })
            .catch(err => console.error('❌ Failed to load G-code:', err.message));
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    status() { this._printer.printStatus(); }
    stop()   { this._printer.stop(); }

}