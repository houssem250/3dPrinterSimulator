import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ModelLoader } from './model_loader.js';
import { XAxisMotion } from './printer_manager/motion/x_axis.js';
import { YAxisMotion } from './printer_manager/motion/y_axis.js';
import { ZAxisMotion } from './printer_manager/motion/z_axis.js';
import { PrintingMotion } from './printer_manager/motion/printing_motion.js';

//Test imports for printing examples
import { PrintingExamples } from './printer_manager/motion/printing_examples.js';


// --- Setup scene, camera, renderer ---
const scene = new THREE.Scene();
window.scene = scene;
scene.background = new THREE.Color(0x888888);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(8, 6, 12);
camera.lookAt(0, 3, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 3, 0);

// --- Lighting ---
scene.add(new THREE.AmbientLight(0xffffff, 1.5));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 15, 7);
dirLight.castShadow = true;
dirLight.receiveShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const fillLight = new THREE.PointLight(0xccddff, 1.2);
fillLight.position.set(-8, 8, 15);
scene.add(fillLight);

const keyLight = new THREE.PointLight(0xffffff, 1.0);
keyLight.position.set(8, 12, 8);
scene.add(keyLight);

const backLight = new THREE.PointLight(0xfffacd, 0.8);
backLight.position.set(0, 8, -15);
scene.add(backLight);

// Bed light — positioned low and in front of the printer, angled up toward the bed
const bedLight = new THREE.SpotLight(0xffffff, 3.0);
bedLight.position.set(0, 2, 8);       // front-center, just above floor level
bedLight.target.position.set(0, 4, 0); // aimed at the bed surface
bedLight.angle = Math.PI / 5;          // narrow cone — focused on the bed
bedLight.penumbra = 0.3;               // soft edge
bedLight.decay = 1.5;
bedLight.distance = 30;
bedLight.castShadow = false;           // no extra shadow cost
bedLight.intensity = 5.0;             // brighter than other lights to highlight the bed
scene.add(bedLight);
scene.add(bedLight.target);

// --- Ground grid and subtle floor ---
const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
gridHelper.position.y = 0;
scene.add(gridHelper);

const floorMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.3 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
floor.receiveShadow = true;
scene.add(floor);


const activeAxes = [];
// --- Helper function to initialize an axis with a timeline and expose it globally ---
function setupAxis(AxisClass, axisName, modelLoader, loadedModel, modelScale, timelinePositions) {
  const axis = new AxisClass(modelLoader, loadedModel, modelScale);

  if (axis.setMaxTravelFromScrew) axis.setMaxTravelFromScrew();
  if (axis.setMaxTravelFromRail) axis.setMaxTravelFromRail(); // Specific for Xif (axis.setMaxTravelFromScrew) axis.setMaxTravelFromScrew();

  const timeStep = 2000;
  const timeline = timelinePositions.map((pos, index) => ({
    position: pos,
    time: index * timeStep
  }));

  axis.setTimeline(timeline);

  console.log(`${axisName}-Axis motion initialized. Use these commands in browser console:`);
  console.log(`  ${axisName.toLowerCase()}.moveToPosition(10, 1000)  - Move to ${axisName}=10mm in 1 second`);
  console.log(`  ${axisName.toLowerCase()}.playTimeline()            - Play the full timeline animation`);
  console.log(`  ${axisName.toLowerCase()}.home()                    - Return to home position`);
  console.log(`  ${axisName.toLowerCase()}.getPosition()             - Get current ${axisName} position`);

  window[axisName.toLowerCase()] = axis;
  window[axisName.toLowerCase() + 'Axis'] = axis;

  // Expose globally and track for "Play All"
  window[axisName.toLowerCase()] = axis;
  activeAxes.push(axis);

  return axis;
}

// --- Load model and set up axes ---
const modelLoader = new ModelLoader(scene);
const modelScale = 10; // Scale factor for the model (adjust as needed)
let xAxisMotion, yAxisMotion, zAxisMotion, printer;

modelLoader.loadModel('models/3dprinter.glb', (loadedModel) => {
  loadedModel.position.set(0, 0, 0);
  loadedModel.scale.set(modelScale, modelScale, modelScale);
  // Log dimensions of the Tisch (bed) for reference
  modelLoader.logTischDimensions();

  camera.position.set(16, 16, 16);

  // include out of range positions to test clamping logic
  const xPositions = [0, -800, 0, 800, 0];
  const yPositions = [0, -800, 0, 800, 0];
  const zPositions = [0, -800, 0, 800, 0];

  xAxisMotion = setupAxis(XAxisMotion, 'X', modelLoader, loadedModel, modelScale, xPositions);
  yAxisMotion = setupAxis(YAxisMotion, 'Y', modelLoader, loadedModel, modelScale, yPositions);
  zAxisMotion = setupAxis(ZAxisMotion, 'Z', modelLoader, loadedModel, modelScale, zPositions);

  // Model hierarchy tools
  modelLoader.printHierarchy();
  window.modelLoader = modelLoader;

  // 🖨️ Initialize Printing Simulation
  printer = new PrintingMotion(xAxisMotion, yAxisMotion, zAxisMotion);
  window.printer = printer;
  
  console.log('\n🖨️ PRINTING SIMULATION READY!');
  console.log('  printer.generateSquarePath(x, y, size, layers) - Generate a square print path');
  console.log('  printer.executePath()                           - Execute the print simulation');
  console.log('  printer.visualizePath(scene)                    - Show the printed path in 3D');
  console.log('  printer.getStatus()                             - Get current printing status');
  console.log('\n  Example: printer.generateSquarePath(50, 50, 20, 3); printer.executePath();');

  if (modelLoader.debugMode) {
    console.log('\n=== DEVELOPER TOOLS ===');
    console.log('  modelLoader.printHierarchy()');
    console.log('  modelLoader.inspectObject("name")');
    console.log('  modelLoader.getObjectPath("name")');
    console.log('  modelLoader.changeColor("name", 0xFF0000)');
    console.log('  modelLoader.changePosition("name", x, y, z)');
  }

  camera.lookAt(16, 16, 16);

  // PrintingExamples must be inside the callback — printer is not ready before this
  window.examples = new PrintingExamples();
});

/**
 * Stress test: Runs all axes through negative, positive, and out-of-range values.
 * Our logic should CLAMP these to 0 or maxTravel automatically.
 */
window.playAll = function() {
    console.log("Starting Stress Test: Checking Clamping Mechanisms...");
    activeAxes.forEach(axis => {
        axis.playTimeline();
    });
};

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// --- Window resize handler ---
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}