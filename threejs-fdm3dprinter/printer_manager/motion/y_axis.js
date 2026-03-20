// y_axis.js
import { BaseAxis } from './base_axis.js';
import * as THREE from 'three';

/**
 * Y-Axis: Bed movement (FORWARD ↔ BACKWARD)
 * Moves: Tisch (bed) along depth direction
 * Note: Y uses position.z (depth axis)
 */
export class YAxisMotion extends BaseAxis {
    constructor(modelLoader, printerModel, modelScale = 1) {
        super(printerModel, {
            axisName: 'Y',
            maxTravel: 300,
            modelScale: modelScale,
            screwPitch: 8
        });

        this.modelLoader = modelLoader;

        // Get moving parts
        this.getMovingParts();
        
        // Calculate limits
        this.calculateLimits();
    }

    getMovingParts() {
        this.trapezoidScrewY0 = this.findPartByName('trapezoid_screwY000');
        this.trapezoidScrewY1 = this.findPartByName('trapezoid_screwY001');

        // Find the Y_axis group or Tisch
        this.yGroup = this.findPartByName('Y_axis');
        this.tisch = this.findPartByName('Tisch');
        
        if (this.yGroup) {
            // If Y_axis group exists, move the whole group
            this.movingParts = [this.yGroup];
            this.initialZ = this.yGroup.position.z;
            console.log('✅ Y-Axis: Using Y_axis group');
        } else if (this.tisch) {
            // Fallback to moving Tisch directly
            this.movingParts = [this.tisch];
            this.initialZ = this.tisch.position.z;
            console.log('✅ Y-Axis: Using Tisch directly');
        } else {
            console.warn('⚠️ Y-Axis: No moving parts found');
            this.movingParts = [];
        }
    }

    calculateLimits() {
        // Use the screw to determine travel limits
        if (this.trapezoidScrewY0) {
            const screwBox = new THREE.Box3().setFromObject(this.trapezoidScrewY0);
            const screwSize = new THREE.Vector3();
            screwBox.getSize(screwSize);
            
            this.visualTravelLimit = screwSize.z * 0.8; // 80% of screw length
            this.visualOffset = screwBox.min.z;
        } else {
            // Fallback limits
            this.visualTravelLimit = 2.5; // Scene units
            this.visualOffset = -0.3;
        }
        
        console.log(`✅ Y-Axis travel: ${this.visualTravelLimit.toFixed(2)}u`);
    }

    updatePartsPosition(yPosition) {
        const safeY = Math.max(0, Math.min(yPosition, this.maxTravel));
        
        // Map mm to scene units
        const t = safeY / this.maxTravel;
        const targetZ = this.visualOffset + (t * this.visualTravelLimit);
        
        // Move all parts
        this.movingParts.forEach(part => {
            if (part) {
                part.position.z = targetZ;
            }
        });
        
        this.currentPosition = safeY;
    }

    setTimeline(timelineKeyframes) {
        this.timeline = timelineKeyframes.sort((a, b) => a.time - b.time);
    }

    logTischDimensions() {
        if (!this.tisch) {
            console.warn('⚠️ Tisch not found');
            return null;
        }

        const box = new THREE.Box3().setFromObject(this.tisch);
        const size = new THREE.Vector3();
        box.getSize(size);

        const dimensions = {
            width: size.x,
            depth: size.z,
            height: size.y
        };

        console.log(`\n=== TISCH (BED) DIMENSIONS ===`);
        console.log(`📏 Width (X): ${dimensions.width.toFixed(4)}`);
        console.log(`📏 Depth (Y): ${dimensions.depth.toFixed(4)}`);
        console.log(`📏 Height (Z): ${dimensions.height.toFixed(4)}`);
        console.log(`============================\n`);

        return dimensions;
    }
}