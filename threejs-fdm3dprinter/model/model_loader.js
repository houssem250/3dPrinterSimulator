/**
 * @file model_loader.js
 * @description Loads the printer GLB, applies material defaults, and exposes
 * a typed `findPartByName()` helper used by every axis class.
 * @module model/model_loader
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  PART_NAMES,
  COLOR_OVERRIDES,
  MATERIAL_DEFAULTS,
} from './model_constants.js';
import { PRINTER_CONFIG } from '../config/printer_config.js';

export class ModelLoader {

  /**
   * @param {THREE.Scene} scene  The scene the loaded model will be added to.
   */
  constructor(scene) {
    this.scene = scene;
    this._loader = new GLTFLoader();

    /** @type {THREE.Group | null} The root object of the loaded GLB. */
    this.model = null;
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  /**
   * Loads the GLB at `url`, applies material corrections, adds it to the
   * scene, and resolves with the model's root `THREE.Group`.
   *
   * @param {string} url  Path to the .glb file.
   * @returns {Promise<THREE.Group>}
   *
   * @example
   * const model = await modelLoader.loadModel('models/3dprinter.glb');
   * model.scale.setScalar(10);
   */
  loadModel(url) {
    return new Promise((resolve, reject) => {
      this._loader.load(
        url,
        (gltf) => {
          this.model = gltf.scene;
          this._setupModel(this.model);
          this.scene.add(this.model);
          console.log(`✅ Model loaded: ${url} (${PART_NAMES.size} parts)`);
          resolve(this.model);
        },
        undefined,
        (error) => {
          console.error(`❌ Failed to load model: ${url}`, error);
          reject(error);
        },
      );
    });
  }

  /**
   * Removed parts are specified as a Set of part names will be ignored during loading.
   * This is useful for parts that are present in the GLB but should not be included in the simulation.
   */
  loadModel(url, removedParts = new Set()) {
    return new Promise((resolve, reject) => {
      this._loader.load(
        url,
        (gltf) => {
          this.model = gltf.scene;

          // Remove specified parts from the model
          if (removedParts.size > 0) {
            this.model.traverse((child) => {
              if (removedParts.has(child.name)) {
                child.visible = false; // Hide the part instead of removing it to avoid issues with references
                console.log(`🚫 Part removed from simulation: ${child.name}`);
              }
            });
          }

          this._setupModel(this.model);
          this.scene.add(this.model);
          console.log(`✅ Model loaded: ${url} (${PART_NAMES.size} parts)`);
          resolve(this.model);
        },
        undefined,
        (error) => {
          console.error(`❌ Failed to load model: ${url}`, error);
          reject(error);
        },
      );
    });
  }

  /**
   * Normalises the loaded model's scale and logs the bed dimensions to the console.
   * @deprecated This method has an extreme bug that can irreversibly distort the model. Do not use until it's fixed.
   */
  getNormalizeModelFactor() {
    if (!this.model) return;

    const bedPart = this.model.getObjectByName("Tisch");
    const referenceObject = bedPart || this.model;

    // Measure raw size of the reference object
    const box = new THREE.Box3().setFromObject(referenceObject);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Target bed size in meters (three.js units)
    const targetWidth = PRINTER_CONFIG.BED.WIDTH_MM * 0.001;

    // Single uniform scale factor
    const scaleFactor = targetWidth / size.x;

    console.log(
      `Normalization factor calculated: ${scaleFactor.toFixed(4)} (target width: ${targetWidth}m, actual width: ${size.x.toFixed(4)}m)`
    );
    console.warn('⚠️  getNormalizeModelFactor() is deprecated and may cause irreversible distortion. Use with caution. \nscaleFactor:', scaleFactor);
    return scaleFactor;
  }
  // ── Part lookup ─────────────────────────────────────────────────────────────

  /**
   * Finds and returns the first object in the model hierarchy whose `.name`
   * matches `partName`. Returns `null` if not found or model not loaded.
   *
   * This is the single traversal helper — all axis classes call this instead
   * of duplicating their own `traverse` loops.
   *
   * @param {string} partName
   * @returns {THREE.Object3D | null}
   */
  findPartByName(partName) {
    if (!this.model) return null;

    let found = null;
    this.model.traverse((child) => {
      if (!found && child.name === partName) {
        found = child;
      }
    });
    return found;
  }

  // ── Bed dimensions ──────────────────────────────────────────────────────────

  /**
   * Logs the print bed ('Tisch') dimensions to the console in both
   * pre-scale and post-scale units.
   *
   * @returns {{ original: { width: number, depth: number }, scaled: { width: number, depth: number } } | null}
   */
  logBedDimensions() {
    const bed = this.findPartByName('Tisch');
    if (!bed) {
      console.warn('⚠️  Bed part (Tisch) not found — model may not be loaded yet.');
      return null;
    }

    const scale = this.model.scale.x;
    const box = new THREE.Box3().setFromObject(bed);
    const size = new THREE.Vector3();
    box.getSize(size);

    const dimensions = {
      original: {
        width: size.x / scale,
        depth: size.z / scale,
      },
      scaled: {
        width: size.x,
        depth: size.z,
      },
    };

    console.log(`\n=== BED DIMENSIONS ===`);
    console.log(`   Original : ${dimensions.original.width.toFixed(4)} × ${dimensions.original.depth.toFixed(4)}`);
    console.log(`   Scaled (${scale}×): ${dimensions.scaled.width.toFixed(4)} × ${dimensions.scaled.depth.toFixed(4)} units`);
    console.log(`======================\n`);

    return dimensions;
  }

  // ── Color utilities (production-safe) ───────────────────────────────────────

  /**
   * Changes the material color of every mesh named `partName`.
   *
   * @param {string} partName
   * @param {number} hexColor  e.g. `0xff0000`
   */
  changeColor(partName, hexColor) {
    this._requireModel('changeColor');

    let found = false;
    this.model.traverse((child) => {
      if (child.isMesh && child.name === partName) {
        _applyColorToMesh(child, hexColor);
        found = true;
      }
    });

    if (found) {
      console.log(`🎨 '${partName}' → #${hexColor.toString(16).padStart(6, '0')}`);
    } else {
      console.warn(`⚠️  Part '${partName}' not found. Known parts: ${[...PART_NAMES].join(', ')}`);
    }
  }

  /**
   * Applies multiple color changes in one call.
   *
   * @param {Map<string, number>} colorMap  partName → hexColor
   */
  changeColors(colorMap) {
    colorMap.forEach((hexColor, partName) => this.changeColor(partName, hexColor));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Traverses the freshly loaded model, registers all part names, and
   * applies shadow + material corrections to every mesh.
   *
   * @param {THREE.Group} model
   */
  _setupModel(model) {
    model.traverse((child) => {
      PART_NAMES.add(child.name);

      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((mat) => {
        if (!mat?.color) return;

        mat.side = THREE.DoubleSide;
        _correctMaterialColor(mat, child.name);
        mat.roughness = MATERIAL_DEFAULTS.ROUGHNESS;
        mat.metalness = MATERIAL_DEFAULTS.METALNESS;
        mat.needsUpdate = true;
      });
    });
  }

  /**
   * Throws a descriptive error if the model hasn't been loaded yet.
   *
   * @param {string} callerName  Name of the method that needs the model.
   */
  _requireModel(callerName) {
    if (!this.model) {
      throw new Error(`ModelLoader.${callerName}() called before loadModel() resolved.`);
    }
  }
}

// ── Module-level helpers (pure functions, no `this`) ───────────────────────────

/**
 * Applies a single hex color to every material on a mesh.
 *
 * @param {THREE.Mesh}  mesh
 * @param {number}      hexColor
 */
function _applyColorToMesh(mesh, hexColor) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((mat) => {
    if (mat?.color) {
      mat.color.setHex(hexColor);
      mat.needsUpdate = true;
    }
  });
}

/**
 * Corrects a material color according to the rules in `MATERIAL_DEFAULTS`:
 *  - Pure white → replaced with mid-gray to avoid blown-out highlights.
 *  - Near-black → brightened so the part doesn't disappear in the scene.
 *  - Explicit override in `COLOR_OVERRIDES` → applied last, wins over all.
 *
 * Mutates `mat` in place.
 *
 * @param {THREE.MeshStandardMaterial} mat
 * @param {string}                     partName
 */
function _correctMaterialColor(mat, partName) {
  const { WHITE_REPLACEMENT, DARKNESS_THRESHOLD, BRIGHTNESS_BOOST } = MATERIAL_DEFAULTS;

  const originalHex = mat.color.getHex();
  const hexString = mat.color.getHexString();

  if (hexString === 'ffffff') {
    mat.color.setHex(WHITE_REPLACEMENT);
  } else if (originalHex < DARKNESS_THRESHOLD) {
    mat.color.setHex(Math.min(0xffffff, originalHex + BRIGHTNESS_BOOST));
  }

  // Explicit override wins over automatic correction
  if (COLOR_OVERRIDES.has(partName)) {
    mat.color.setHex(/** @type {number} */(COLOR_OVERRIDES.get(partName)));
  }
}
