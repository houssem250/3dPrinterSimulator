/**
 * @file OctoPrintService.js
 * @description Handles HTTP communication with OctoPrint's REST API.
 */

export class OctoPrintService {
  /**
   * Verifies if an OctoPrint instance is reachable and the API key is valid.
   * @param {string} ip The IP address or hostname (e.g., '192.168.1.42' or 'localhost').
   * @param {string} apiKey The OctoPrint API Key.
   * @returns {Promise<{success: boolean, version?: string, message?: string}>}
   */
  static async verifyConnection(ip, apiKey) {
    // Ensure IP has a protocol
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    
    try {
      console.log(`🔍 OctoPrint: Verifying connection to ${baseUrl}...`);
      
      const response = await fetch(`${baseUrl}/api/version`, {
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        // Set a reasonable timeout
        signal: AbortSignal.timeout(5000) 
      });

      if (response.status === 200) {
        const data = await response.json();
        return { 
          success: true, 
          version: data.server, 
          message: `Connected to OctoPrint v${data.server}` 
        };
      } else if (response.status === 403) {
        return { success: false, message: "Invalid API Key (403 Forbidden)" };
      } else {
        return { success: false, message: `OctoPrint returned status ${response.status}` };
      }
    } catch (err) {
      console.error('❌ OctoPrint: Connection verification failed:', err);
      return { success: false, message: "Connection failed. Check IP and network." };
    }
  }

  /**
   * Fetches the full current state (Job + Printer) for synchronization.
   * @param {string} ip 
   * @param {string} apiKey 
   */
  static async fetchCurrentState(ip, apiKey) {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;
    try {
      const [jobRes, printerRes] = await Promise.all([
        fetch(`${baseUrl}/api/job`, { headers: { 'X-Api-Key': apiKey } }),
        fetch(`${baseUrl}/api/printer`, { headers: { 'X-Api-Key': apiKey } })
      ]);

      const jobData = jobRes.ok ? await jobRes.json() : {};
      const printerData = printerRes.ok ? await printerRes.json() : {};

      const isPrinting = (jobData.state || "").toLowerCase().includes("printing");
      const isPaused = (jobData.state || "").toLowerCase().includes("paused");
      const isOperational = printerData.state?.flags?.operational ?? false;

      return {
        success: true,
        isPrinting,
        isPaused,
        isOperational,
        fileName: jobData.job?.file?.name || "No file selected",
        progress: jobData.progress?.completion || 0,
        temp: {
           nozzle: printerData.temperature?.tool0?.actual || 0,
           bed: printerData.temperature?.bed?.actual || 0,
           nozzleTarget: printerData.temperature?.tool0?.target || 0,
           bedTarget: printerData.temperature?.bed?.target || 0
        }
      };
    } catch (err) {
      return { success: false };
    }
  }
}
