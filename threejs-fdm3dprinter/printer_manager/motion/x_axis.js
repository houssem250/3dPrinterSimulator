import { BaseAxis } from './base_axis.js';
import * as THREE from 'three';

/**
 * X-Axis Motion — print-head carriage LEFT ↔ RIGHT
 *
 * ─── How it moves ─────────────────────────────────────────────────────────
 *  The X_axis GROUP (confirmed in Blender hierarchy) is a child of Z_axis.
 *  Moving X_axis.position.x slides the entire carriage assembly together —
 *  no need to touch individual parts.
 *
 * ─── Travel limits (roller-based) ────────────────────────────────────────
 *  GalgenHorizontral carries two static end-stop rollers called 'Rollen'
 *  (one at each end, both children of Z_axis).
 *  The carriage has its own roller 'RollenGondel' (child of X_axis).
 *
 *  Physical rule:
 *    LEFT  limit  → RollenGondel right edge  touches left  Rollen left edge
 *    RIGHT limit  → RollenGondel left  edge  touches right Rollen right edge
 *
 *  We read both Rollen world-X positions, subtract the carriage roller width,
 *  and that gives the exact visual travel range.
 *
 * ─── Coordinate note ──────────────────────────────────────────────────────
 *  X_axis is a LOCAL child of Z_axis.
 *  position.x on X_axis is LOCAL to Z_axis — not world X.
 *  All bounding boxes must be converted to Z_axis LOCAL space before use,
 *  or we must work purely in world space and convert back.
 *  Here we work in world space and convert the final target back to local.
 */
export class XAxisMotion extends BaseAxis {
    constructor(modelLoader, printerModel, modelScale = 1) {
        super(printerModel, {
            axisName: 'X',
            maxTravel: 300,
            modelScale: modelScale,
            screwPitch: 8
        });

        this.modelLoader = modelLoader;

        // The group to move — confirmed child of Z_axis in Blender
        this.xGroup = this.findPartByName('X_axis');

        if (!this.xGroup) {
            console.error('❌ X-Axis: X_axis group not found. Check GLB export.');
            return;
        }

        // Parts used for limit calculation (NOT moved — just measured)
        this.galgenHorizontral = this.findPartByName('GalgenHorizontral');
        this.trapezoidScrewX   = this.findPartByName('trapezoid_screwX000');

        // RollenGondel = carriage roller (child of X_axis, moves with it)
        this.rollenGondel = this.findPartByName('RollenGondel');

        // Rollen = static end-stop roller (child of Z_axis, does NOT move with carriage)
        // There are two — we identify them by world X position (left vs right)
        this.calculateLimits();

        console.log(`✅ X-Axis: group found with ${this.xGroup.children.length} children`);
    }

    // ─── Limit Calculation ────────────────────────────────────────────────────

    calculateLimits() {
        if (!this.xGroup || !this.rollenGondel) {
            console.warn('⚠️ X-Axis: cannot calculate limits — missing xGroup or RollenGondel');
            this.worldMinX = -0.5;
            this.worldMaxX =  0.5;
            return;
        }

        // --- Carriage roller size (world space) ---
        const rollenBox  = new THREE.Box3().setFromObject(this.rollenGondel);
        const rollenSize = new THREE.Vector3();
        rollenBox.getSize(rollenSize);
        const rollenHalfWidth = rollenSize.x / 2;

        // --- Find the two static end-stop Rollen by world X position ---
        // 'Rollen' is the name used in the Blender hierarchy (child of Z_axis)
        // There may be multiple objects with this name — collect all of them.
        const stopRollers = [];
        this.printerModel.traverse(child => {
            if (child.name === 'Rollen' && child !== this.rollenGondel) {
                const b = new THREE.Box3().setFromObject(child);
                stopRollers.push(b);
            }
        });

        if (stopRollers.length < 2) {
            // Fallback: use GalgenHorizontral rail extents
            console.warn('⚠️ X-Axis: fewer than 2 Rollen found — falling back to rail limits');
            if (this.galgenHorizontral) {
                const railBox  = new THREE.Box3().setFromObject(this.galgenHorizontral);
                this.worldMinX = railBox.min.x + rollenHalfWidth;
                this.worldMaxX = railBox.max.x - rollenHalfWidth;
            } else {
                this.worldMinX = -0.5;
                this.worldMaxX =  0.5;
            }
        } else {
            // Sort by world X — first is left stop, last is right stop
            stopRollers.sort((a, b) => a.min.x - b.min.x);
            const leftStop  = stopRollers[0];
            const rightStop = stopRollers[stopRollers.length - 1];

            // Carriage roller right edge touches left stop's left edge
            // → carriage roller centre at: leftStop.min.x + rollenHalfWidth
            this.worldMinX = leftStop.min.x + rollenHalfWidth;

            // Carriage roller left edge touches right stop's right edge
            // → carriage roller centre at: rightStop.max.x - rollenHalfWidth
            this.worldMaxX = rightStop.max.x - rollenHalfWidth;
        }

        // Convert world X limits → X_axis LOCAL X limits
        // X_axis is a child of Z_axis; get Z_axis world matrix to invert
        const zAxisGroup = this.xGroup.parent;
        if (zAxisGroup) {
            const invWorld = new THREE.Matrix4().copy(zAxisGroup.matrixWorld).invert();
            const localMin = new THREE.Vector3(this.worldMinX, 0, 0).applyMatrix4(invWorld);
            const localMax = new THREE.Vector3(this.worldMaxX, 0, 0).applyMatrix4(invWorld);
            this.localMinX = localMin.x;
            this.localMaxX = localMax.x;
        } else {
            // No parent transform — world == local
            this.localMinX = this.worldMinX;
            this.localMaxX = this.worldMaxX;
        }

        console.log(`🛡️ X-Axis limits:`);
        console.log(`   World  X: ${this.worldMinX.toFixed(4)}  →  ${this.worldMaxX.toFixed(4)}`);
        console.log(`   Local  X: ${this.localMinX.toFixed(4)}  →  ${this.localMaxX.toFixed(4)}`);
        console.log(`   Visual travel: ${(this.localMaxX - this.localMinX).toFixed(4)} units`);
    }

    // ─── Position Update ──────────────────────────────────────────────────────

    updatePartsPosition(xPosition) {
        if (!this.xGroup) return;

        // 1. CLAMP mm to valid range
        const safeX = Math.max(0, Math.min(xPosition, this.maxTravel));

        // 2. MAP mm [0 … maxTravel] → local X [localMinX … localMaxX]
        const t      = safeX / this.maxTravel;
        const localX = this.localMinX + t * (this.localMaxX - this.localMinX);

        // 3. MOVE the whole group — one line, everything stays together
        this.xGroup.position.x = localX;

        // 4. ROTATE the lead screw
        if (this.trapezoidScrewX) {
            this.trapezoidScrewX.rotation.x = (safeX / this.screwPitch) * Math.PI * 2;
        }

        this.currentPosition = safeX;
    }

    // ─── Timeline ─────────────────────────────────────────────────────────────

    setTimeline(timelineKeyframes) {
        this.timeline = timelineKeyframes.sort((a, b) => a.time - b.time);
        console.log('X-Axis timeline set with', this.timeline.length, 'keyframes');
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    isAtLeftLimit()  { return this.currentPosition <= 0; }
    isAtRightLimit() { return this.currentPosition >= this.maxTravel; }
}