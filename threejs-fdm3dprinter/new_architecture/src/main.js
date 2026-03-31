/**
 * @file main.js
 * @description Entry point for the new simulation architecture.
 * 
 * Flow:
 * 1. Initialize Scene & Renderer.
 * 2. Initialize PrinterState (The single source of truth).
 * 3. Initialize SimulationEngine (The controller).
 * 4. Choose & Start a Provider (Standalone or Stream).
 */
import { SceneManager } from './visuals/SceneManager.js';
import { PrinterState } from './core/PrinterState.js';
import { SimulationEngine } from './core/SimulationEngine.js';
import { StandaloneProvider } from './providers/StandaloneProvider.js';
import { StreamProvider } from './providers/StreamProvider.js';

// 1. Setup Visuals
const sceneManager = new SceneManager();

// 2. Setup State & Engine
const state = new PrinterState();
const engine = new SimulationEngine(state, sceneManager);

// 3. Setup Providers
const standalone = new StandaloneProvider(state);
const stream = new StreamProvider(state, 'ws://localhost:8080');

// 4. Start-up Logic (Simplified)
// window.toggleMode = (mode) => { ... }
standalone.start(); // Default
