// create ready to use 3D printer model and add it to the scene
// create GLTFLoader and load the printer model from models/printer.glb
// add the loaded model to the scene and position it correctly
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export class ModelLoader {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.model = null;  // Store the loaded model for later color changes
        this.debugMode = false; // Set to true to enable these tools
    }

    // List of part names in the GLTF model 
    static PART_NAMES = new Set();

    static PART_NAMES_TO_COLOR = new Map([
        // Example: ['Frame', 0x333333], ['Bed', 0x333366], ['Motor', 0x222222]
    ]);

    findPartByName(name) {
        if (!this.model) return null;
        let found = null;
        this.model.traverse((child) => {
            if (child.name === name) {
                found = child;
            }
        });
        return found;
    }

    loadModel(url, onLoad) {
        this.loader.load(
            url,
            (gltf) => {
                const model = gltf.scene;
                this.model = model;

                model.traverse((child) => {
                    // 1. COLLECT EVERY OBJECT (Groups, Meshes, etc.)
                    // This ensures "Fan housing", "X axis", etc. are recorded.
                    ModelLoader.PART_NAMES.add(child.name);
                    //console.log(`Object Found: ${child.name} | Type: ${child.type}`);

                    // 2. MESH-SPECIFIC LOGIC (Shadows, Colors, Materials)
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        const materials = Array.isArray(child.material) ? child.material : [child.material];

                        materials.forEach((mat) => {
                            if (mat) {
                                mat.side = THREE.DoubleSide;

                                if (mat.color) {
                                    const originalColor = mat.color.getHex();
                                    const hex = mat.color.getHexString();

                                    //console.log(`-> Mesh: ${child.name} | Color: #${hex}`);

                                    if (hex === 'ffffff') {
                                        ModelLoader.PART_NAMES_TO_COLOR.set(child.name, 0x888888);
                                        mat.color.setHex(0x888888);
                                    } else if (originalColor < 0x333333) {
                                        const brightened = Math.min(0xffffff, originalColor + 0x444444);
                                        mat.color.setHex(brightened);
                                    }

                                    mat.roughness = 0.7;
                                    mat.metalness = 0.2;
                                    mat.needsUpdate = true;
                                }
                            }
                        });
                    }
                });

                this.scene.add(model);
                if (onLoad) onLoad(model);
            },
            undefined,
            (error) => console.error('Error loading model:', error)
        );
    }

    /**
     * Log the dimensions of the Tisch (print bed) in both original and scaled units.
     * Reads the current model scale automatically — no need to pass it in.
     */
    logTischDimensions() {
        const tisch = this.findPartByName('Tisch');
        if (!tisch) {
            console.warn('⚠️ Tisch part not found');
            return;
        }

        // Read scale directly from the loaded model
        const currentScale = this.model.scale.x;

        const box = new THREE.Box3().setFromObject(tisch);
        const size = new THREE.Vector3();
        box.getSize(size);

        const dimensions = {
            original: {
                width: size.x / currentScale,
                depth: size.z / currentScale
            },
            scaled: {
                width: size.x,
                depth: size.z
            }
        };

        console.log(`\n=== TISCH (BED) MEASUREMENTS ===`);
        console.log(`📏 Original Size: ${dimensions.original.width.toFixed(4)} x ${dimensions.original.depth.toFixed(4)}`);
        console.log(`🚀 Scaled Size (${currentScale}x): ${dimensions.scaled.width.toFixed(4)} x ${dimensions.scaled.depth.toFixed(4)} units`);
        console.log(`================================\n`);

        return dimensions;
    }

    // 2. Change Colors - Change color of a specific part by name
    changeColor(partName, hexColor) {
        if (!this.model) {
            console.error('Model not loaded yet');
            return;
        }

        let found = false;
        this.model.traverse((child) => {
            if (child.isMesh && child.name === partName) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];

                materials.forEach((mat) => {
                    if (mat && mat.color) {
                        mat.color.setHex(hexColor);
                        mat.needsUpdate = true;
                    }
                });

                console.log(`Changed color of '${partName}' to #${hexColor.toString(16).padStart(6, '0')}`);
                found = true;
            }
        });

        if (!found) {
            console.warn(`Part '${partName}' not found. Available parts: ${Array.from(ModelLoader.PART_NAMES).join(', ')}`);
        }
    }

    // Change multiple colors at once
    changeColors(colorMap) {
        colorMap.forEach((hexColor, partName) => {
            this.changeColor(partName, hexColor);
        });
    }

    // Developer tool

    //  Disabled for now - can be re-enabled if needed

    /**
     * Get detailed hierarchy of the model structure
     * Shows groups, meshes, and their parent-child relationships
     */
    analyzeHierarchy() {
        if (!this.model) {
            console.error('Model not loaded yet');
            return;
        }

        const hierarchyData = {
            groups: [],
            meshes: [],
            hierarchy: []
        };

        // First pass: collect all objects by type
        this.model.traverse((child) => {
            const objectInfo = {
                name: child.name,
                type: child.type,
                isGroup: child.isGroup,
                isMesh: child.isMesh,
                childCount: child.children.length,
                position: { x: child.position.x, y: child.position.y, z: child.position.z },
                scale: { x: child.scale.x, y: child.scale.y, z: child.scale.z }
            };

            if (child.isMesh) {
                objectInfo.geometry = child.geometry ? child.geometry.type : 'Unknown';
                objectInfo.materialCount = Array.isArray(child.material) ? child.material.length : 1;
                hierarchyData.meshes.push(objectInfo);
            } else if (child.isGroup || child.children.length > 0) {
                hierarchyData.groups.push(objectInfo);
            }
        });

        // Build hierarchy tree
        const buildTree = (object, depth = 0) => {
            const indent = '  '.repeat(depth);
            const icon = object.isMesh ? '📦' : object.isGroup ? '📁' : '⚙️';
            const childInfo = object.children.length > 0 ? ` (${object.children.length} children)` : '';

            let line = `${indent}${icon} ${object.name}${childInfo} [${object.type}]`;
            hierarchyData.hierarchy.push(line);

            object.children.forEach(child => {
                buildTree(child, depth + 1);
            });
        };

        buildTree(this.model);
        return hierarchyData;
    }

    /**
     * Print hierarchy tree to console with visual formatting
     */
    printHierarchy() {
        if (!this.debugMode) return null; // Logic disabled

        if (!this.model) {
            console.error('Model not loaded yet');
            return;
        }

        console.log('\n========== MODEL HIERARCHY ANALYSIS ==========\n');

        const hierarchyData = this.analyzeHierarchy();

        console.log(`📊 SUMMARY:`);
        console.log(`   Total Groups: ${hierarchyData.groups.length}`);
        console.log(`   Total Meshes: ${hierarchyData.meshes.length}`);
        console.log(`   Total Objects: ${hierarchyData.groups.length + hierarchyData.meshes.length}\n`);

        console.log(`📁 HIERARCHY TREE:`);
        hierarchyData.hierarchy.forEach(line => console.log(line));

        console.log(`\n📦 MESHES (Renderable Geometry):`);
        hierarchyData.meshes.forEach(mesh => {
            console.log(`   • ${mesh.name}`);
            console.log(`     └─ Type: ${mesh.geometry} | Materials: ${mesh.materialCount}`);
        });

        console.log(`\n📂 GROUPS (Container Objects):`);
        hierarchyData.groups.slice(0, 20).forEach(group => {
            console.log(`   • ${group.name} (${group.childCount} children)`);
        });
        if (hierarchyData.groups.length > 20) {
            console.log(`   ... and ${hierarchyData.groups.length - 20} more groups`);
        }

        console.log(`\n============================================\n`);
    }

    /**
     * Get all objects of specific type
     */
    getObjectsByType(type) {
        if (!this.debugMode) return null; // Logic disabled

        const objects = [];
        this.model.traverse((child) => {
            if (type === 'mesh' && child.isMesh) {
                objects.push(child);
            } else if (type === 'group' && (child.isGroup || child.children.length > 0)) {
                objects.push(child);
            }
        });
        return objects;
    }

    /**
     * Get parent hierarchy path for a given object name
     */
    getObjectPath(objectName) {
        if (!this.debugMode) return null; // Logic disabled        

        let targetObject = null;
        this.model.traverse((child) => {
            if (child.name === objectName) {
                targetObject = child;
            }
        });

        if (!targetObject) {
            console.warn(`Object '${objectName}' not found`);
            return null;
        }

        const path = [];
        let current = targetObject;
        while (current) {
            path.unshift(current.name);
            current = current.parent;
        }

        return path;
    }

    /**
     * Print detailed info about a specific object and its hierarchy
     */
    inspectObject(objectName) {
        if (!this.debugMode) return null; // Logic disabled

        const path = this.getObjectPath(objectName);
        if (!path) return;

        console.log(`\n========== OBJECT INSPECTION: ${objectName} ==========`);
        console.log(`📍 Path: ${path.join(' > ')}`);

        let targetObject = null;
        this.model.traverse((child) => {
            if (child.name === objectName) {
                targetObject = child;
            }
        });

        if (targetObject) {
            console.log(`\n📋 Properties:`);
            console.log(`   Type: ${targetObject.type}`);
            console.log(`   Is Mesh: ${targetObject.isMesh}`);
            console.log(`   Is Group: ${targetObject.isGroup}`);
            console.log(`   Children: ${targetObject.children.length}`);

            console.log(`\n📍 Transform:`);
            console.log(`   Position: x=${targetObject.position.x.toFixed(2)}, y=${targetObject.position.y.toFixed(2)}, z=${targetObject.position.z.toFixed(2)}`);
            console.log(`   Scale: x=${targetObject.scale.x.toFixed(2)}, y=${targetObject.scale.y.toFixed(2)}, z=${targetObject.scale.z.toFixed(2)}`);
            console.log(`   Rotation: x=${(targetObject.rotation.x * 180 / Math.PI).toFixed(2)}°, y=${(targetObject.rotation.y * 180 / Math.PI).toFixed(2)}°, z=${(targetObject.rotation.z * 180 / Math.PI).toFixed(2)}°`);

            if (targetObject.isMesh) {
                console.log(`\n🔹 Mesh Info:`);
                console.log(`   Geometry Type: ${targetObject.geometry.type}`);
                console.log(`   Material Count: ${Array.isArray(targetObject.material) ? targetObject.material.length : 1}`);
                if (targetObject.geometry.attributes) {
                    console.log(`   Vertices: ${targetObject.geometry.attributes.position.count}`);
                }
            }

            if (targetObject.children.length > 0) {
                console.log(`\n👶 Children:`);
                targetObject.children.forEach(child => {
                    console.log(`   • ${child.name} [${child.type}]`);
                });
            }
        }

        console.log(`\n============================================\n`);
    }

    /**
     * Change position of object (works with both groups and meshes)
     */
    changePosition(partName, x, y, z) {
        if (!this.debugMode) return null; // Logic disabled

        if (!this.model) {
            console.error('Model not loaded yet');
            return;
        }

        let found = false;
        this.model.traverse((child) => {
            if (child.name === partName) {
                child.position.set(x, y, z);
                console.log(`Changed position of '${partName}' to (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
                found = true;
            }
        });

        if (!found) {
            console.warn(`Part '${partName}' not found`);
        }
    }

    /**
     * Get statistics about the model
     */
    getStatistics() {
        if (!this.debugMode) return null; // Logic disabled

        if (!this.model) {
            console.error('Model not loaded yet');
            return null;
        }

        let meshCount = 0;
        let groupCount = 0;
        let vertexTotal = 0;
        let triangleTotal = 0;

        this.model.traverse((child) => {
            if (child.isMesh) {
                meshCount++;
                if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                    vertexTotal += child.geometry.attributes.position.count;
                    if (child.geometry.index) {
                        triangleTotal += child.geometry.index.count / 3;
                    }
                }
            } else if (child.isGroup || child.children.length > 0) {
                groupCount++;
            }
        });

        const stats = {
            meshes: meshCount,
            groups: groupCount,
            totalObjects: meshCount + groupCount,
            vertices: vertexTotal,
            triangles: triangleTotal
        };

        console.log(`\n========== MODEL STATISTICS ==========`);
        console.log(`📦 Meshes: ${stats.meshes}`);
        console.log(`📂 Groups: ${stats.groups}`);
        console.log(`📊 Total Objects: ${stats.totalObjects}`);
        console.log(`🔺 Total Vertices: ${stats.vertices.toLocaleString()}`);
        console.log(`△ Total Triangles: ${Math.round(stats.triangles).toLocaleString()}`);
        console.log(`=====================================\n`);

        return stats;
    }

    printFullTree() {
        if (!this.model) {
            console.error('Model not loaded yet');
            return;
        }

        console.log('\n========== FULL SCENE TREE ==========');

        const walk = (object, depth = 0) => {
            const indent = '  '.repeat(depth);
            const icon = object.isMesh ? '📦' : object.isGroup ? '📁' : '⚙️';
            const pos = object.position;
            const posStr = `(x:${pos.x.toFixed(3)}, y:${pos.y.toFixed(3)}, z:${pos.z.toFixed(3)})`;
            console.log(`${indent}${icon} "${object.name}" [${object.type}] ${posStr}`);
            object.children.forEach(child => walk(child, depth + 1));
        };

        walk(this.model);
        console.log('=====================================\n');
    }
}