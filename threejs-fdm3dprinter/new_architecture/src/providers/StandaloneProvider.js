import { BaseProvider } from './BaseProvider.js';

/**
 * @file StandaloneProvider.js
 * @description Traditional G-code file runner.
 */
export class StandaloneProvider extends BaseProvider {
  loadGCode(file) {
    // Parse G-code -> Moves
  }

  async start() {
    // Loop through moves
    // await delay(...)
    // this.state.update(...)
  }
}
