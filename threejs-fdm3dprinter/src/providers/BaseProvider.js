/**
 * @file BaseProvider.js
 * @description Abstract base class for data providers (Standalone, Stream, etc.).
 * 
 * It defines the lifecycle of a provider and the frame-emitting interface.
 */

export class BaseProvider {
  /**
   * Initializes the provider.
   * @param {import('../core/FrameNormalizer.js').FrameNormalizer} normalizer
   */
  constructor(normalizer) {
    this.normalizer = normalizer;
    this.onFrameCallback = null;
    this.name = 'BaseProvider';
  }

  /**
   * Starts the provider.
   */
  start() {
    console.log(`Provider [${this.name}] starting…`);
  }

  /**
   * Stops the provider.
   */
  stop() {
    console.log(`Provider [${this.name}] stopping…`);
  }

  /**
   * Sets the callback function for normalized frames.
   * @param {Function} callback (frame) => void
   */
  onFrame(callback) {
    this.onFrameCallback = callback;
  }

  /**
   * Normalizes and emits a frame.
   * @param {object} rawData 
   * @param {object} [context] 
   * @protected
   */
  emit(rawData, context = {}) {
    if (!this.onFrameCallback) return;
    
    // Normalizer ensures consistent shape
    const normalized = this.normalizer.normalize(rawData, context);
    this.onFrameCallback(normalized);
  }
}
