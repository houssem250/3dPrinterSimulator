import React, { useEffect, useRef } from 'react';
import { FarmSystem } from '../../core/FarmSystem.js';

/**
 * SceneView Component
 * 
 * This is the 'Bridge' between React and the Vanilla Three.js simulation.
 * It mounts the FarmSystem into a container div and handles resizing.
 */
const SceneView = () => {
  const mountRef = useRef(null);
  const systemRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Initialize the Vanilla Three.js system
    const system = new FarmSystem(mountRef.current);
    systemRef.current = system;
    
    // Boot the farm
    system.init();

    // Handle Window Resize
    const handleResize = () => {
      if (systemRef.current) {
        systemRef.current.resize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (systemRef.current) {
        systemRef.current.dispose();
      }
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      className="absolute inset-0 w-full h-full bg-slate-900"
      id="canvas-container"
    />
  );
};

export default SceneView;
