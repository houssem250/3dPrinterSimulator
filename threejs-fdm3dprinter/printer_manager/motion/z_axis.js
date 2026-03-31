// z_axis.js
import { BaseAxis } from './base_axis.js';
import * as THREE from 'three';

/**
 * Z-Axis: Gantry movement (UP ↕ DOWN)
 * Moves: Entire gantry assembly vertically
 * Note: Z modifies position.y; coordinates with X
 */
export class ZAxisMotion extends BaseAxis {
    constructor(modelLoader, printerModel, modelScale = 1) {
        super(printerModel, {
            axisName: 'Z',
            maxTravel: 250,
            modelScale: modelScale,
            screwPitch: 8
        });

        this.modelLoader = modelLoader;

        // Get moving parts
        this.getMovingParts();
        
        // Calculate limits
        this.calculatePhysicalLimits();
    }

    getMovingParts() {
        this.trapezoidScrewZ0 = this.findPartByName('trapezoid_screwZ000');
        this.trapezoidScrewZ1 = this.findPartByName('trapezoid_screwZ001');

        // Find the Z_axis group
        this.zGroup = this.findPartByName('Z_axis');
        
        if (this.zGroup) {
            // If Z_axis group exists, move the whole group
            this.movingParts = [this.zGroup];
            this.initialY = this.zGroup.position.y;
            console.log('✅ Z-Axis: Using Z_axis group');
        } else {
            // Fallback to individual parts
            const partNames = [
                'GalgenHorizontral',
                'X_axis',
                'MotorHorizontal',
                'Extruder',
                'Feder',
                'Bolt003'
            ];

            this.movingParts = partNames.map(name => {
                const part = this.findPartByName(name);
                return { obj: part, initialY: part ? part.position.y : 0 };
            }).filter(item => item.obj);
        }
    }

    calculatePhysicalLimits() {
        const ceiling = this.findPartByName('U_trapezoid001');
        const klammer = this.findPartByName('Klammernvertikal');
        const bed = this.findPartByName('Tisch');
        const sensor = this.findPartByName('Nevelierungsschalter');

        if (!ceiling || !klammer || !bed || !sensor) {
            console.warn('⚠️ Z-Axis: Missing parts for limit calculation');
            // Set default limits
            this.minDelta = 0;
            this.maxDelta = 3.0;
            return;
        }

        const ceilingBox = new THREE.Box3().setFromObject(ceiling);
        const klammerBox = new THREE.Box3().setFromObject(klammer);
        const bedBox = new THREE.Box3().setFromObject(bed);
        const sensorBox = new THREE.Box3().setFromObject(sensor);

        // Upward limit: Klammer hits ceiling
        this.maxDelta = ceilingBox.min.y - klammerBox.max.y;
        
        // Downward limit: Sensor hits bed
        this.minDelta = bedBox.max.y - sensorBox.min.y;
        
        console.log(`✅ Z-Axis travel: up ${this.maxDelta.toFixed(3)}u, down ${this.minDelta.toFixed(3)}u`);
    }

    updatePartsPosition(zPosition) {
        const safeZ = Math.max(0, Math.min(zPosition, this.maxTravel));
        
        // Map 0-maxTravel to physical delta range
        const t = safeZ / this.maxTravel;
        const delta = this.minDelta + t * (this.maxDelta - this.minDelta);
        
        // Move all parts
        if (this.zGroup) {
            // Move the whole group
            this.zGroup.position.y = this.initialY + delta;
        } else {
            // Move individual parts
            this.movingParts.forEach(item => {
                if (item.obj) {
                    item.obj.position.y = item.initialY + delta;
                }
            });
        }
        
        this.currentPosition = safeZ;
    }

    setTimeline(timelineKeyframes) {
        this.timeline = timelineKeyframes.sort((a, b) => a.time - b.time);
    }
}