import * as THREE from 'three';
import { PrinterInstance } from './PrinterInstance.js';
import { PrinterBay } from '../../visualization/PrinterBay.js';
import { AppContext } from '../../app_context.js';

/**
 * @file PrinterFarmManager.js
 * @description Manages the layout, focus, and lifecycle of multiple printers.
 */
export class PrinterFarmManager {
  /**
   * @param {THREE.Scene} scene 
   * @param {THREE.PerspectiveCamera} camera 
   * @param {object} controls OrbitControls instance
   */
  constructor(scene, camera, controls) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;

    this.printers = [];
    this.bays = [];

    // Focus State
    this.focusTargetId = null;
    this.isTransitioning = false;
    this.lerpFactor = 0.15; // Faster camera transition
    
    // Callbacks for UI sync
    this._onSelectCallbacks = [];

    // Placement Mode State
    this.isPlacementMode = false;
    this.ghostBays = [];
    this.pendingVariant = null;
    this.occupiedPositions = new Set(); // Stores "x,z" strings

    // Optimized camera distances for CAD look
    this.focusOffset = new THREE.Vector3(0, 3, 12);     // Facing view, farther
    this.overviewOffset = new THREE.Vector3(0, 40, 15); // Higher technical overview
  }

  /**
   * Register a callback for when a printer is selected.
   * @param {function(number)} cb 
   */
  onSelect(cb) {
    this._onSelectCallbacks.push(cb);
  }

  /**
   * Spawns a grid of printers.
   */
  setupGrid(rows, cols, spacing, sourceModel, mqttService) {
    this.clear();
    this.sourceModel = sourceModel;
    this.mqttService = mqttService;
    this.spacing = spacing;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = this.printers.length;
        const worldOffset = new THREE.Vector3(
          c * spacing - ((cols - 1) * spacing) / 2,
          0,
          r * spacing - ((rows - 1) * spacing) / 2
        );
        this.addPrinter(worldOffset, { name: 'Standard' });
      }
    }
    AppContext.printers = this.printers;
  }

  /**
   * Adds a printer at a specific location with a variant config.
   */
  addPrinter(position, variant) {
    const id = this.printers.length;
    
    // 1. Create Bay
    const bay = new PrinterBay(id, position, this.scene);
    this.bays.push(bay);

    // 2. Create Printer
    const instanceModel = this.sourceModel.clone(true);
    
    // De-couple materials for this specific instance
    instanceModel.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        // Apply variant colors if provided
        if (variant.color !== undefined && variant.color !== null) {
          child.material.color.setHex(variant.color);
        }
        if (variant.emissive !== undefined) {
           child.material.emissive.setHex(variant.emissive);
        }
      }
    });

    this.scene.add(instanceModel);
    const printer = new PrinterInstance(id, instanceModel, position, this.scene, this.mqttService);
    this.printers.push(printer);
    
    // Mark slot as occupied
    this.occupiedPositions.add(`${position.x},${position.z}`);
    
    // Notify UI
    this._onSelectCallbacks.forEach(cb => cb(null, true)); // Signal "Added"
    return printer;
  }

  /**
   * Smoothly moves the camera to focus on a specific printer.
   */
  focusOn(id) {
    if (id === null) {
      this.focusTargetId = null;
      return;
    }
    this.focusTargetId = id;
    this.isTransitioning = true;
    this.mode = 'focus';
  }

  /**
   * Switches to a top-down overview of the entire farm.
   */
  focusOverview() {
    this.isTransitioning = true;
    this.mode = 'overview';
    this.focusTargetId = -1; // Special ID for overview
    this.select(null);
  }

  /**
   * Enters the interactive deployment mode.
   */
  enterPlacementMode(variant) {
    this.isPlacementMode = true;
    this.pendingVariant = variant;
    this.focusOverview(); // Start with an overview

    // Visualise potential spots
    this._createGhostGrid();

    // Show Overlay
    const overlay = document.getElementById('placement-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.querySelector('.v-name').textContent = variant.name;
    }
  }

  exitPlacementMode() {
    this.isPlacementMode = false;
    this.pendingVariant = null;
    this.ghostBays.forEach(g => this.scene.remove(g));
    this.ghostBays = [];

    const overlay = document.getElementById('placement-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  _createGhostGrid() {
    this.ghostBays.forEach(g => this.scene.remove(g));
    this.ghostBays = [];

    const neighbors = new Set();
    const offsets = [
      { x: this.spacing, z: 0 },
      { x: -this.spacing, z: 0 },
      { x: 0, z: this.spacing },
      { x: 0, z: -this.spacing }
    ];

    // Find all empty neighbors of occupied slots
    this.occupiedPositions.forEach(posKey => {
      const [ox, oz] = posKey.split(',').map(Number);
      
      offsets.forEach(off => {
        const nx = ox + off.x;
        const nz = oz + off.z;
        const nKey = `${nx},${nz}`;
        
        if (!this.occupiedPositions.has(nKey)) {
          neighbors.add(nKey);
        }
      });
    });

    // Spawn ghosts at unique neighbor positions
    neighbors.forEach(nKey => {
      const [nx, nz] = nKey.split(',').map(Number);
      const pos = new THREE.Vector3(nx, 0, nz);
      const ghost = this._makeGhostBay(pos);
      this.scene.add(ghost);
      this.ghostBays.push(ghost);
    });
  }

  _makeGhostBay(pos) {
    const geo = new THREE.BoxGeometry(7, 0.1, 7);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.15,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.userData = { isGhost: true };
    return mesh;
  }

  /**
   * Handles raycasting inside Placement Mode.
   */
  handleInteraction(raycaster) {
    if (!this.isPlacementMode) return;

    const intersects = raycaster.intersectObjects(this.ghostBays);
    
    // Reset all
    this.ghostBays.forEach(g => {
      g.material.opacity = 0.15;
      g.material.color.setHex(0xffaa00);
    });

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      hit.material.opacity = 0.5;
      hit.material.color.setHex(0xffffff);
      
      // On Mouse Click is handled in main.js
      return hit.position;
    }
    return null;
  }

  /**
   * Should be called in the main animate() loop.
   */
  update() {
    if (!this.isTransitioning) return;

    let targetPos, idealCamPos;

    if (this.mode === 'overview') {
      targetPos = new THREE.Vector3(0, 0, 0);
      idealCamPos = targetPos.clone().add(this.overviewOffset);
    } else {
      const printer = this.printers.find(p => p.id === this.focusTargetId);
      if (!printer) return;
      targetPos = printer.worldOffset.clone().add(new THREE.Vector3(0, 0.5, 0));
      idealCamPos = targetPos.clone().add(this.focusOffset);
    }

    this.controls.target.lerp(targetPos, this.lerpFactor);
    this.camera.position.lerp(idealCamPos, this.lerpFactor);

    if (this.camera.position.distanceTo(idealCamPos) < 0.01) {
      this.isTransitioning = false;
    }
  }

  /**
   * Highlights the selected bay.
   */
  select(id) {
    this.bays.forEach(bay => bay.setSelection(bay.id === id));
    if (id !== null) this.focusOn(id);

    // Trigger UI callbacks
    this._onSelectCallbacks.forEach(cb => cb(id));
  }

  /**
   * Toggles a glow effect on a printer model.
   * @param {number} id 
   * @param {boolean} active 
   */
  highlight(id, active) {
    const printer = this.printers.find(p => p.id === id);
    if (!printer) return;

    const highlightColor = new THREE.Color(0xffaa00); // Premium Warm Amber

    printer.model.traverse((child) => {
      if (child.isMesh && child.material) {
        // We use the emissive property to create a "Glow" effect
        if (active) {
          // Store original emissive if not already stored
          if (child.userData.originalEmissive === undefined) {
             child.userData.originalEmissive = child.material.emissive.clone();
             child.userData.originalIntensity = child.material.emissiveIntensity;
          }
          child.material.emissive.copy(highlightColor);
          child.material.emissiveIntensity = 0.8;
        } else {
          // Restore original emissive
          if (child.userData.originalEmissive !== undefined) {
            child.material.emissive.copy(child.userData.originalEmissive);
            child.material.emissiveIntensity = child.userData.originalIntensity;
          }
        }
      }
    });
  }

  clear() {
    this.printers.forEach(p => p.model.parent?.remove(p.model));
    this.bays.forEach(b => b.destroy());
    this.printers = [];
    this.bays = [];
    AppContext.printers = [];
  }
}
