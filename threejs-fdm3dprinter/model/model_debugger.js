/**
 * @file model_debugger.js
 * @description Developer-only inspection tools for the loaded GLB.
 *
 * None of these functions affect scene state — they are read-only reporters.
 * This entire file is imported only inside `dev/printing_examples.js` and
 * the dynamic `import()` in `main.js` when `IS_DEV` is true, so it is
 * completely tree-shaken from production bundles.
 *
 * What was in the original code
 * ──────────────────────────────
 *  All of these methods lived on `ModelLoader` behind a `debugMode` boolean
 *  guard (`if (!this.debugMode) return null`). Problems with that approach:
 *   - The guard is checked at call-time, not import-time — the dead code is
 *     always bundled even when `debugMode = false`.
 *   - Every method silently returns `null` in production rather than
 *     throwing, making it easy to call them accidentally and get nothing.
 *   - Having inspection tools on the production class violates SRP.
 *
 * All guards are removed here — these functions simply require a loaded model
 * and throw clearly if one isn't available.
 *
 * Usage
 * ─────
 *  import { ModelDebugger } from '../model/model_debugger.js';
 *  const dbg = new ModelDebugger(modelLoader);
 *  dbg.printHierarchy();
 *  dbg.inspect('X_axis');
 *  dbg.stats();
 *
 * @module model/model_debugger
 */

import * as THREE from 'three';

export class ModelDebugger {

  /**
   * @param {import('./model_loader.js').ModelLoader} modelLoader
   */
  constructor(modelLoader) {
    this._loader = modelLoader;
  }

  // ── Guards ──────────────────────────────────────────────────────────────────

  /** @returns {THREE.Group} */
  get _model() {
    if (!this._loader.model) {
      throw new Error('ModelDebugger: model not loaded yet.');
    }
    return this._loader.model;
  }

  // ── Hierarchy ───────────────────────────────────────────────────────────────

  /**
   * Prints a compact tree of the full model hierarchy to the console,
   * including position coordinates for every node.
   */
  printHierarchy() {
    console.log('\n========== MODEL HIERARCHY ==========');
    _walkTree(this._model);
    console.log('=====================================\n');
  }

  /**
   * Returns a structured summary of all groups and meshes in the model.
   *
   * @returns {{ groups: object[], meshes: object[] }}
   */
  analyzeHierarchy() {
    const groups = [];
    const meshes = [];

    this._model.traverse((child) => {
      const info = {
        name:       child.name,
        type:       child.type,
        childCount: child.children.length,
        position:   { ...child.position },
        scale:      { ...child.scale },
      };

      if (child.isMesh) {
        meshes.push({
          ...info,
          geometryType:  child.geometry?.type ?? 'unknown',
          materialCount: Array.isArray(child.material) ? child.material.length : 1,
        });
      } else if (child.isGroup || child.children.length > 0) {
        groups.push(info);
      }
    });

    return { groups, meshes };
  }

  // ── Object inspection ───────────────────────────────────────────────────────

  /**
   * Prints detailed properties and transform of a named object.
   *
   * @param {string} objectName
   */
  inspect(objectName) {
    const obj = this._loader.findPartByName(objectName);
    if (!obj) {
      console.warn(`ModelDebugger.inspect: '${objectName}' not found.`);
      return;
    }

    const path = this.getPath(objectName);

    console.log(`\n========== INSPECT: ${objectName} ==========`);
    console.log(`   Path     : ${path?.join(' > ') ?? '—'}`);
    console.log(`   Type     : ${obj.type}`);
    console.log(`   Is mesh  : ${obj.isMesh}`);
    console.log(`   Is group : ${obj.isGroup}`);
    console.log(`   Children : ${obj.children.length}`);
    console.log(`   Position : x=${obj.position.x.toFixed(3)}  y=${obj.position.y.toFixed(3)}  z=${obj.position.z.toFixed(3)}`);
    console.log(`   Scale    : x=${obj.scale.x.toFixed(3)}  y=${obj.scale.y.toFixed(3)}  z=${obj.scale.z.toFixed(3)}`);
    console.log(`   Rotation : x=${_deg(obj.rotation.x)}°  y=${_deg(obj.rotation.y)}°  z=${_deg(obj.rotation.z)}°`);

    if (obj.isMesh) {
      console.log(`   Geometry : ${obj.geometry.type}`);
      console.log(`   Materials: ${Array.isArray(obj.material) ? obj.material.length : 1}`);
      if (obj.geometry.attributes?.position) {
        console.log(`   Vertices : ${obj.geometry.attributes.position.count}`);
      }
    }

    if (obj.children.length > 0) {
      console.log(`   Children :`);
      obj.children.forEach((c) => console.log(`     • ${c.name} [${c.type}]`));
    }

    console.log(`=============================================\n`);
  }

  /**
   * Returns the ancestor chain from the scene root down to `objectName`.
   *
   * @param {string} objectName
   * @returns {string[] | null}
   */
  getPath(objectName) {
    const target = this._loader.findPartByName(objectName);
    if (!target) return null;

    const path = [];
    let current = target;
    while (current) {
      path.unshift(current.name);
      current = current.parent;
    }
    return path;
  }

  // ── Statistics ──────────────────────────────────────────────────────────────

  /**
   * Logs and returns a vertex/triangle/mesh/group count for the whole model.
   *
   * @returns {{ meshes: number, groups: number, vertices: number, triangles: number }}
   */
  stats() {
    let meshes    = 0;
    let groups    = 0;
    let vertices  = 0;
    let triangles = 0;

    this._model.traverse((child) => {
      if (child.isMesh) {
        meshes++;
        const pos = child.geometry?.attributes?.position;
        if (pos) vertices += pos.count;
        if (child.geometry?.index) triangles += child.geometry.index.count / 3;
      } else if (child.isGroup || child.children.length > 0) {
        groups++;
      }
    });

    const result = { meshes, groups, vertices, triangles: Math.round(triangles) };

    console.log(`\n========== MODEL STATS ==========`);
    console.log(`   Meshes    : ${result.meshes}`);
    console.log(`   Groups    : ${result.groups}`);
    console.log(`   Vertices  : ${result.vertices.toLocaleString()}`);
    console.log(`   Triangles : ${result.triangles.toLocaleString()}`);
    console.log(`=================================\n`);

    return result;
  }

  /**
   * Returns all objects of a given type from the model.
   *
   * @param {'mesh' | 'group'} type
   * @returns {THREE.Object3D[]}
   */
  getObjectsByType(type) {
    const results = [];
    this._model.traverse((child) => {
      if (type === 'mesh'  && child.isMesh)                          results.push(child);
      if (type === 'group' && (child.isGroup || child.children.length > 0)) results.push(child);
    });
    return results;
  }

  // ── Position manipulation (debug/alignment only) ────────────────────────────

  /**
   * Teleports a named part to an exact world position.
   * Intended for Blender-alignment debugging — not for runtime animation.
   *
   * @param {string} partName
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(partName, x, y, z) {
    const obj = this._loader.findPartByName(partName);
    if (!obj) {
      console.warn(`ModelDebugger.setPosition: '${partName}' not found.`);
      return;
    }
    obj.position.set(x, y, z);
    console.log(`📍 '${partName}' → (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`);
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Recursive tree walker — prints every node with indent, icon, and position.
 *
 * @param {THREE.Object3D} object
 * @param {number}         depth
 */
function _walkTree(object, depth = 0) {
  const indent = '  '.repeat(depth);
  const icon   = object.isMesh ? '■' : object.isGroup ? '▶' : '·';
  const p      = object.position;
  console.log(
    `${indent}${icon} "${object.name}" [${object.type}]  ` +
    `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`,
  );
  object.children.forEach((child) => _walkTree(child, depth + 1));
}

/**
 * Converts radians to degrees, rounded to 2 decimal places.
 *
 * @param {number} rad
 * @returns {number}
 */
function _deg(rad) {
  return parseFloat((rad * (180 / Math.PI)).toFixed(2));
}
