/**
 * @file OctoPrintControlService.js
 * @description Handles remote control commands (Start, Pause, Temp) via OctoPrint REST API.
 */

export class OctoPrintControlService {
  /**
   * Issues a command to the OctoPrint job API.
   * @param {string} ip 
   * @param {string} apiKey 
   * @param {'start'|'pause'|'cancel'|'resume'} command 
   */
  static async issueJobCommand(ip, apiKey, command) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    let action = command;
    if (command === 'resume') action = 'pause'; // OctoPrint uses 'pause' with 'resume' action

    const payload = { command: action };
    if (command === 'pause' || command === 'resume') {
        payload.action = command;
    }

    try {
      const response = await fetch(`${baseUrl}/api/job`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 409) {
          return { success: false, conflict: true };
      }

      const success = response.status === 204 || response.status === 200;
      
      // Fallback for resume: if explicit resume fails, try a toggle
      if (!success && command === 'resume') {
          const retryRes = await fetch(`${baseUrl}/api/job`, {
            method: 'POST',
            headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'pause', action: 'toggle' })
          });
          return { success: retryRes.ok };
      }

      return { success };
    } catch (err) {
      console.error(`❌ OctoPrint: Failed to issue ${command} command:`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Sets target temperatures on the remote printer.
   * @param {string} ip 
   * @param {string} apiKey 
   * @param {'tool'|'bed'} type 
   * @param {number} value 
   */
  static async setTemperature(ip, apiKey, type, value) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    const endpoint = type === 'bed' ? '/api/printer/bed' : '/api/printer/tool';
    
    const payload = type === 'bed' 
        ? { command: 'target', target: value }
        : { command: 'target', targets: { tool0: value } };

    try {
      const response = await fetch(`${baseUrl}/api/printer/${type === 'bed' ? 'bed' : 'tool'}`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      return response.status === 204 || response.status === 200;
    } catch (err) {
      console.error(`❌ OctoPrint: Failed to set ${type} temperature:`, err);
      return false;
    }
  }

  /**
   * Uploads a file to OctoPrint's local storage.
   * @param {string} ip 
   * @param {string} apiKey 
   * @param {File} file 
   */
  static async uploadFile(ip, apiKey, file) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${baseUrl}/api/files/local`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey
        },
        body: formData
      });

      return response.status === 201 || response.status === 200;
    } catch (err) {
      console.error(`❌ OctoPrint: Failed to upload file:`, err);
      return false;
    }
  }

  /**
   * Selects a file and optionally starts printing it.
   * @param {string} ip 
   * @param {string} apiKey 
   * @param {string} filename 
   */
  static async selectAndPrint(ip, apiKey, filename) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    
    try {
      const response = await fetch(`${baseUrl}/api/files/local/${filename}`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: 'select', print: true })
      });

      if (response.status === 409) {
          console.warn(`[OctoPrint] Select/Print rejected: Printer is busy or not operational.`);
          return { success: false, conflict: true };
      }

      return response.status === 200;
    } catch (err) {
      console.error(`❌ OctoPrint: Failed to select/print file ${filename}:`, err);
      return false;
    }
  }

  /**
   * Deletes a file from OctoPrint's local storage.
   * @param {string} ip 
   * @param {string} apiKey 
   * @param {string} filename 
   */
  static async deleteFile(ip, apiKey, filename) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    
    try {
      const response = await fetch(`${baseUrl}/api/files/local/${filename}`, {
        method: 'DELETE',
        headers: {
          'X-Api-Key': apiKey
        }
      });

      return response.status === 204 || response.status === 200;
    } catch (err) {
      console.error(`❌ OctoPrint: Failed to delete file ${filename}:`, err);
      return false;
    }
  }

  /**
   * Generates a direct download URL for a file in OctoPrint.
   * @param {string} ip 
   * @param {string} apiKey 
   * @param {string} filename 
   */
  static getDownloadUrl(ip, apiKey, filename) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    // OctoPrint allows API key via query parameter for direct downloads
    return `${baseUrl}/api/files/local/${filename}?apikey=${apiKey}`;
  }

  /**
   * Retrieves current connection options and state from OctoPrint.
   * @param {string} ip 
   * @param {string} apiKey 
   */
  static async getConnection(ip, apiKey) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    try {
      const response = await fetch(`${baseUrl}/api/connection`, {
        method: 'GET',
        headers: { 'X-Api-Key': apiKey }
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (err) {
      console.error(`❌ OctoPrint: Failed to get connection settings:`, err);
      return null;
    }
  }

  /**
   * Sets the connection state on OctoPrint.
   * @param {string} ip 
   * @param {string} apiKey 
   * @param {'connect'|'disconnect'} command 
   * @param {string} [port] 
   * @param {number} [baudrate] 
   */
  static async setConnection(ip, apiKey, command, port, baudrate) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    const payload = { command };
    
    if (command === 'connect') {
      if (port && port !== 'AUTO') payload.port = port;
      if (baudrate && baudrate !== 'AUTO') payload.baudrate = Number(baudrate);
    }

    try {
      const response = await fetch(`${baseUrl}/api/connection`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      return response.status === 204 || response.status === 200;
    } catch (err) {
      console.error(`❌ OctoPrint: Failed to issue connection command ${command}:`, err);
      return false;
    }
  }
}
