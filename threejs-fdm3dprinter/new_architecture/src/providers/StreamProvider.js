import { BaseProvider } from './BaseProvider.js';

/**
 * @file StreamProvider.js
 * @description Real-time data receiver (MQTT/WebSockets).
 */
export class StreamProvider extends BaseProvider {
  constructor(state, url) {
    super(state);
    this.url = url;
  }

  start() {
    // Connect to MQTT/WS
    // Normalize incoming data -> { x, y, z, e, t... }
    // this.state.update(normalizedData)
  }
}
