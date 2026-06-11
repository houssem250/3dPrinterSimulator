/**
 * @file DbTelemetryReplay.js
 * @description Replays telemetry rows from a local SQLite database directly in
 * the browser using sql.js (SQLite compiled to WebAssembly). No Python script,
 * no Mosquitto broker required.
 *
 * Lifecycle (mirrors TelemetryMocker API):
 *   load(dbPath, callbacks) → fetches DB, resolves when ready
 *   start()      → begins replay from row 0
 *   pause()      → freezes position in replay
 *   resume()     → continues from paused position
 *   stop()       → halts replay, calls onFinished
 *   stopSilent() → halts replay without callbacks (mode switch)
 */

// sql.js is loaded lazily on first use from CDN.
// It provides a full SQLite engine compiled to WASM.
const SQL_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js';
const SQL_JS_WASM = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm';

let sqlJsPromise = null;

async function getSqlJs() {
  if (sqlJsPromise) return sqlJsPromise;
  sqlJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SQL_JS_CDN;
    script.onload = async () => {
      try {
        // initSqlJs is injected globally by the sql-wasm.js script
        const SQL = await window.initSqlJs({ locateFile: () => SQL_JS_WASM });
        resolve(SQL);
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return sqlJsPromise;
}

export class DbTelemetryReplay {
  /**
   * @param {number} printerId
   * @param {function} publishCallback  Called with (topic, payloadString)
   * @param {object}  [options]
   * @param {number}  [options.speedFactor=10]   Replay speed multiplier (same as Python script default)
   * @param {number}  [options.maxGapMs=500]     Cap on inter-message delay (scaled by speedFactor)
   */
  constructor(printerId, publishCallback, options = {}) {
    this.printerId   = printerId;
    this.publish     = publishCallback;
    this.speedFactor = options.speedFactor ?? 10;
    this.maxGapMs    = options.maxGapMs    ?? 500;

    // Internal state
    this._rows       = null;   // flat array of { topic, ts: Date, payload }
    this._cursor     = 0;      // current replay position
    this._rafHandle  = null;   // requestAnimationFrame handle
    this._isRunning  = false;
    this._lastWallMs = null;   // wall-clock time of last dispatched row
    this._lastRowTs  = null;   // DB timestamp of last dispatched row
    this._dbPath     = null;

    // Callbacks (set by load())
    this._onProgress = null;
    this._onReady    = null;
    this._onFinished = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get isLoaded()  { return this._rows !== null; }
  get isRunning() { return this._isRunning; }
  get cursor()    { return this._cursor; }
  get total()     { return this._rows?.length ?? 0; }

  /**
   * Fetches the SQLite DB from `dbPath`, loads it into sql.js, and queries all
   * rows ordered by insertion (rowid), exactly like the Python script.
   *
   * Progress is reported through `updateActiveJob` in Zustand via the callbacks
   * you set on `options` — keeping it decoupled from the store.
   *
   * @param {string}   dbPath       e.g. '/sample_telemetry/telemetry_normal_3.db'
   * @param {object}   [callbacks]
   * @param {function} [callbacks.onProgress]  (pct: 0–100) called during fetch
   * @param {function} [callbacks.onReady]     () called when DB is ready to play
   * @param {function} [callbacks.onFinished]  () called when replay completes
   */
  async load(dbPath, callbacks = {}) {
    this._dbPath     = dbPath;
    this._onProgress = callbacks.onProgress ?? null;
    this._onReady    = callbacks.onReady    ?? null;
    this._onFinished = callbacks.onFinished ?? null;

    this._rows   = null;
    this._cursor = 0;

    try {
      // 1. Fetch the binary DB file with streaming progress
      const response = await fetch(dbPath);
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${dbPath}`);

      const contentLength = Number(response.headers.get('Content-Length') || 0);
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (contentLength > 0 && this._onProgress) {
          this._onProgress(Math.round((received / contentLength) * 90)); // 0-90%
        }
      }

      // Assemble ArrayBuffer
      const buffer = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }

      if (this._onProgress) this._onProgress(92);

      // 2. Load sql.js WASM engine
      const SQL = await getSqlJs();
      if (this._onProgress) this._onProgress(96);

      // 3. Open DB and query all rows (insertion order = chronological)
      const db = new SQL.Database(buffer);
      const result = db.exec(
        'SELECT topic, timestamp, payload_json FROM telemetry ORDER BY rowid ASC'
      );
      db.close();

      if (this._onProgress) this._onProgress(99);

      if (!result.length || !result[0].values.length) {
        throw new Error('No telemetry rows found in database.');
      }

      // 4. Parse timestamps into Date objects up-front
      const rawRows = result[0].values; // [[topic, ts_str, payload], ...]
      this._rows = rawRows.map(([topic, tsStr, payload]) => ({
        topic,
        ts: this._parseTimestamp(tsStr),
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload)
      }));

      if (this._onProgress) this._onProgress(100);
      console.log(`[DbReplay] ✅ Loaded ${this._rows.length} rows from ${dbPath}`);

      if (this._onReady) this._onReady();

    } catch (err) {
      console.error('[DbReplay] ❌ Failed to load DB:', err);
      throw err;
    }
  }

  /** Start replay from the beginning */
  start() {
    if (!this._rows) { console.warn('[DbReplay] DB not loaded yet.'); return; }
    if (this._isRunning) return;

    this._cursor     = 0;
    this._lastWallMs = null;
    this._lastRowTs  = null;
    this._isRunning  = true;

    console.log(`[DbReplay] ▶ Starting replay of ${this._rows.length} rows at ${this.speedFactor}× speed`);
    this._scheduleNext();
  }

  /** Pause: freeze cursor, cancel pending frame */
  pause() {
    if (!this._isRunning) return;
    this._isRunning = false;
    if (this._rafHandle) { cancelAnimationFrame(this._rafHandle); this._rafHandle = null; }
    console.log(`[DbReplay] ⏸ Paused at row ${this._cursor}/${this._rows?.length}`);
  }

  /** Resume from paused position */
  resume() {
    if (this._isRunning || !this._rows) return;
    // Reset timing anchor so we don't try to "catch up" on paused time
    this._lastWallMs = null;
    this._lastRowTs  = null;
    this._isRunning  = true;
    console.log(`[DbReplay] ▶ Resumed from row ${this._cursor}`);
    this._scheduleNext();
  }

  /** Full stop — calls onFinished */
  stop() {
    this._halt();
    if (this._onFinished) this._onFinished();
    console.log('[DbReplay] ⏹ Stopped (onFinished called)');
  }

  /** Silent halt — used on mode switch, no callbacks */
  stopSilent() {
    this._halt();
    console.log('[DbReplay] ✕ Silent stop');
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _halt() {
    this._isRunning = false;
    if (this._rafHandle) { cancelAnimationFrame(this._rafHandle); this._rafHandle = null; }
  }

  _scheduleNext() {
    if (!this._isRunning || !this._rows || this._cursor >= this._rows.length) {
      if (this._cursor >= (this._rows?.length ?? 0)) {
        console.log('[DbReplay] 🏁 Replay complete.');
        this._isRunning = false;
        if (this._onFinished) this._onFinished();
      }
      return;
    }

    const row     = this._rows[this._cursor];
    const now     = performance.now();

    let delayMs = 0;

    if (this._lastWallMs !== null && this._lastRowTs !== null && row.ts) {
      // Calculate real-world ms between this row and last, then scale by speed factor
      const dbDeltaMs  = row.ts - this._lastRowTs;
      if (dbDeltaMs > 0) {
        const scaledMs   = dbDeltaMs / this.speedFactor;
        const maxMs      = this.maxGapMs / this.speedFactor;
        const elapsed    = now - this._lastWallMs;
        delayMs = Math.max(0, Math.min(scaledMs, maxMs) - elapsed);
      }
    }

    if (delayMs <= 2) {
      // Dispatch immediately this frame
      this._dispatch(row, now);
    } else {
      // Use setTimeout for longer waits, then rAF for frame alignment
      this._rafHandle = setTimeout(() => {
        if (!this._isRunning) return;
        this._rafHandle = requestAnimationFrame(() => {
          if (!this._isRunning) return;
          this._dispatch(row, performance.now());
        });
      }, delayMs);
    }
  }

  _dispatch(row, wallMs) {
    this._lastWallMs = wallMs;
    this._lastRowTs  = row.ts;

    try {
      this.publish(row.topic, row.payload);
    } catch (e) {
      // Swallow individual row errors to keep replay going
      console.warn('[DbReplay] row dispatch error:', e);
    }

    this._cursor++;
    this._scheduleNext();
  }

  _parseTimestamp(tsStr) {
    if (!tsStr || typeof tsStr !== 'string') return null;
    try {
      const normalized = tsStr.endsWith('Z') ? tsStr : tsStr + 'Z';
      const d = new Date(normalized);
      return isNaN(d.getTime()) ? null : d.getTime(); // ms since epoch
    } catch {
      return null;
    }
  }
}
