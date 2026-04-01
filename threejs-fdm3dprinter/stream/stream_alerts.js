/**
 * @file stream_alerts.js
 * @description Alert system for stream mode operational notifications.
 *
 * This module manages alerts and notifications to prevent conflicts between
 * standalone (examples) and stream modes, and to inform users of stream status.
 *
 * @module stream/stream_alerts
 */

export class StreamAlerts {
  /**
   * Alert types
   */
  static AlertType = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
  };

  /**
   * Active alerts listener storage
   */
  constructor() {
    this.alerts = [];
    this.listeners = [];
    this.maxAlerts = 10; // Keep recent alerts
  }

  /**
   * Create and emit an alert
   * @param {string} type Alert type (from AlertType)
   * @param {string} title Alert title
   * @param {string} message Alert message
   * @param {object} options Optional metadata
   * @returns {object} Alert object
   */
  createAlert(type, title, message, options = {}) {
    const alert = {
      id: `alert-${Date.now()}-${Math.random()}`,
      type,
      title,
      message,
      timestamp: new Date().toISOString(),
      duration: options.duration ?? null, // null = persistent
      metadata: options.metadata ?? {},
    };

    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }

    this._notifyListeners(alert);
    return alert;
  }

  /**
   * Alert: Printer in process, cannot start stream
   */
  alertPrinterInProcess() {
    return this.createAlert(
      StreamAlerts.AlertType.WARNING,
      'Printer In Process',
      'Standalone mode is currently running. Wait for completion or reset before enabling stream mode.',
      { duration: 5000 }
    );
  }

  /**
   * Alert: Stream mode activated
   */
  alertStreamModeActive() {
    return this.createAlert(
      StreamAlerts.AlertType.INFO,
      'Stream Mode Enabled',
      'Real-time printer synchronization is now active. Examples mode is disabled.',
      { duration: 3000 }
    );
  }

  /**
   * Alert: Stream mode deactivated
   */
  alertStreamModeInactive() {
    return this.createAlert(
      StreamAlerts.AlertType.INFO,
      'Stream Mode Disabled',
      'Switched back to standalone mode.',
      { duration: 3000 }
    );
  }

  /**
   * Alert: Mode conflict detected
   */
  alertModeConflict() {
    return this.createAlert(
      StreamAlerts.AlertType.CRITICAL,
      'Mode Conflict',
      'Stream update received while printer is in standalone mode. Pausing stream updates.',
      { duration: 0 } // Persistent
    );
  }

  /**
   * Alert: MQTT connection established
   */
  alertMQTTConnected() {
    return this.createAlert(
      StreamAlerts.AlertType.INFO,
      'MQTT Connected',
      'Successfully connected to MQTT broker.',
      { duration: 2000 }
    );
  }

  /**
   * Alert: MQTT connection lost
   */
  alertMQTTDisconnected() {
    return this.createAlert(
      StreamAlerts.AlertType.ERROR,
      'MQTT Disconnected',
      'Lost connection to MQTT broker. Attempting to reconnect...',
      { duration: 0 } // Persistent
    );
  }

  /**
   * Alert: MQTT error
   */
  alertMQTTError(errorMessage) {
    return this.createAlert(
      StreamAlerts.AlertType.ERROR,
      'MQTT Error',
      `Connection error: ${errorMessage}`,
      { duration: 0 } // Persistent
    );
  }

  /**
   * Alert: Update parsing failed
   */
  alertParseError(detail) {
    return this.createAlert(
      StreamAlerts.AlertType.WARNING,
      'Parse Error',
      `Failed to parse stream data: ${detail}`,
      { duration: 4000 }
    );
  }

  /**
   * Subscribe to alert notifications
   * @param {Function} callback Called with alert object when new alert is created
   */
  onAlert(callback) {
    this.listeners.push(callback);
  }

  /**
   * Unsubscribe from alert notifications
   * @param {Function} callback Callback to remove
   */
  offAlert(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback);
  }

  /**
   * Clear a specific alert by ID
   * @param {string} alertId Alert ID to clear
   */
  clearAlert(alertId) {
    this.alerts = this.alerts.filter(a => a.id !== alertId);
  }

  /**
   * Clear all alerts
   */
  clearAll() {
    this.alerts = [];
  }

  /**
   * Get recent alerts
   * @param {number} limit Max number of alerts to return
   * @returns {object[]} Array of alert objects
   */
  getRecentAlerts(limit = 10) {
    return this.alerts.slice(-limit);
  }

  /**
   * Notify all listeners of new alert
   * @param {object} alert Alert object
   * @private
   */
  _notifyListeners(alert) {
    this.listeners.forEach(callback => {
      try {
        callback(alert);
      } catch (err) {
        console.error('Alert listener error:', err);
      }
    });
  }
}

export default StreamAlerts;
