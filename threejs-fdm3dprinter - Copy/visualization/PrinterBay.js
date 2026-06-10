import * as THREE from 'three';

/**
 * @file PrinterBay.js
 * @description Visual workstation slot for a printer. 
 * Provides a floor plate and visual highlighting for selection.
 */
export class PrinterBay {
  /**
   * @param {number} id 
   * @param {THREE.Vector3} position 
   * @param {THREE.Scene} scene 
   */
  constructor(id, position, scene) {
    this.id = id;
    this.position = position.clone();
    this.scene = scene;

    this.group = new THREE.Group();
    this.group.name = `Bay_${id}`;
    this.group.position.copy(this.position);

    this._isSelected = false;

    this._createFloor();
    this._createBorder();
    
    this.scene.add(this.group);
  }

  _createFloor() {
    const geometry = new THREE.BoxGeometry(8, 0.1, 8); // Larger bounds for the machine
    const material = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.8,
      metalness: 0.2
    });
    this.floor = new THREE.Mesh(geometry, material);
    this.floor.position.y = -0.05; // Sit slightly below Y=0
    this.floor.receiveShadow = true;
    
    // Custom data for Raycasting
    this.floor.userData = { isBay: true, bayId: this.id };
    
    this.group.add(this.floor);
  }

  _createBorder() {
    const geometry = new THREE.PlaneGeometry(8.1, 8.1);
    this.borderMat = new THREE.MeshBasicMaterial({
      color: 0x0088ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    this.border = new THREE.Mesh(geometry, this.borderMat);
    this.border.rotation.x = Math.PI / 2;
    this.border.position.y = 0.01; // Slightly above floor
    
    this.group.add(this.border);
  }

  setSelection(selected) {
    this._isSelected = selected;
    this.borderMat.opacity = selected ? 0.8 : 0.3;
    this.borderMat.color.setHex(selected ? 0x00ffff : 0x0088ff);
  }

  destroy() {
    this.scene.remove(this.group);
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.border.geometry.dispose();
    this.borderMat.dispose();
  }
}
