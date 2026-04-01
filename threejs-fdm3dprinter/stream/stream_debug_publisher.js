/**
 * @file stream_debug_publisher.js
 * @description Test helper for stream mode - simulates real MQTT publisher
 *
 * Use this to test stream mode without a real printer.
 *
 * Usage:
 * import { StreamDebugPublisher } from './stream_debug_publisher.js'
 * const publisher = new StreamDebugPublisher(app.stream.subscriber)
 * publisher.simulateLinearMotion()  // Move nozzle in a line
 *
 * @module stream/stream_debug_publisher
 */

export class StreamDebugPublisher {
  /**
   * @param {MQTTSubscriber} subscriber MQTT subscriber to emit events to
   */
  constructor(subscriber) {
    this.subscriber = subscriber;
    this.isRunning = false;
    this.currentPos = { x: 0, y: 0, z: 2, e: 0 };
  }

  /**
   * Simulate linear motion (X axis movement)
   * Publishes position updates every 100ms
   */
  simulateLinearMotion() {
    if (this.isRunning) {
      console.warn('Publisher already running');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Simulating linear motion...');

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      this.currentPos.x = step * 5; // Move 5mm per step
      this.currentPos.e += 0.5; // Extrude

      const state = {
        timestamp: new Date().toISOString(),
        position: { ...this.currentPos },
        status: {
          is_extruding: true,
          is_printing: true,
        },
        temperature: {
          nozzle: 210,
          bed: 60,
        },
      };

      this.subscriber._emit('stateUpdate', state);

      if (step >= 20) {
        clearInterval(interval);
        this.isRunning = false;
        console.log('✅ Linear motion complete');
      }
    }, 100);
  }

  /**
   * Simulate circular motion (XY plane)
   */
  simulateCircularMotion() {
    if (this.isRunning) {
      console.warn('Publisher already running');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Simulating circular motion...');

    let step = 0;
    const radius = 50;
    const interval = setInterval(() => {
      step += 1;
      const angle = (step / 20) * Math.PI * 2; // Full circle in 20 steps

      this.currentPos.x = 100 + radius * Math.cos(angle);
      this.currentPos.y = 100 + radius * Math.sin(angle);
      this.currentPos.e += 0.5;

      const state = {
        timestamp: new Date().toISOString(),
        position: { ...this.currentPos },
        status: {
          is_extruding: true,
          is_printing: true,
        },
        temperature: {
          nozzle: 210,
          bed: 60,
        },
      };

      this.subscriber._emit('stateUpdate', state);

      if (step >= 20) {
        clearInterval(interval);
        this.isRunning = false;
        console.log('✅ Circular motion complete');
      }
    }, 100);
  }

  /**
   * Simulate layer height change (Z axis)
   */
  simulateLayerMotion() {
    if (this.isRunning) {
      console.warn('Publisher already running');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Simulating layer motion...');

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      this.currentPos.z += 0.2; // Add layer height
      this.currentPos.e += 5; // Extrude per layer

      const state = {
        timestamp: new Date().toISOString(),
        position: { ...this.currentPos },
        status: {
          is_extruding: true,
          is_printing: true,
        },
        temperature: {
          nozzle: 210,
          bed: 60,
        },
      };

      this.subscriber._emit('stateUpdate', state);

      if (step >= 5) {
        clearInterval(interval);
        this.isRunning = false;
        console.log('✅ Layer motion complete');
      }
    }, 500);
  }

  /**
   * Publish a single state update
   */
  publishPosition(x, y, z, e = 0, isExtruding = false) {
    this.currentPos = { x, y, z, e };

    const state = {
      timestamp: new Date().toISOString(),
      position: { ...this.currentPos },
      status: {
        is_extruding: isExtruding,
        is_printing: isExtruding,
      },
      temperature: {
        nozzle: 210,
        bed: 60,
      },
    };

    this.subscriber._emit('stateUpdate', state);
    console.log(`📍 Published position: X=${x}, Y=${y}, Z=${z}, E=${e}`);
  }

  /**
   * Stop any running simulation
   */
  stop() {
    this.isRunning = false;
    console.log('⏹️  Publisher stopped');
  }
}

export default StreamDebugPublisher;
