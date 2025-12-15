//
// WebSocket client utilities
// Provides a small pub/sub layer for run events with graceful no-op when disabled.
//
// Exposes:
// - connectRunEvents(): returns an object with subscribe(event, cb), unsubscribe(event, cb), close()
//   Events: 'open', 'close', 'error', 'message', and any backend-specific event types relayed via JSON payloads.
//   If WS is disabled via env, returns a no-op client that never connects.
//
// All public functions are annotated with PUBLIC_INTERFACE.
//

import { getAppEnv, isWsEnabled } from '../utils/env';

function createEmitter() {
  const handlers = new Map(); // event -> Set<fn>
  return {
    on(event, fn) {
      const set = handlers.get(event) || new Set();
      set.add(fn);
      handlers.set(event, set);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      const set = handlers.get(event);
      if (!set) return;
      set.delete(fn);
      if (set.size === 0) handlers.delete(event);
    },
    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const fn of set) {
        try { fn(payload); } catch (e) { /* swallow */ }
      }
    },
    clear() {
      handlers.clear();
    }
  };
}

function safeParseJson(data) {
  try { return JSON.parse(data); } catch { return null; }
}

// PUBLIC_INTERFACE
export function connectRunEvents() {
  /**
   * Connect to the WebSocket endpoint and provide a small event emitter interface.
   * Gracefully degrades to a no-op client if WS is disabled or URL is missing.
   */
  const env = getAppEnv();
  if (!isWsEnabled() || !env.wsUrl) {
    // No-op client
    const emitter = createEmitter();
    const api = {
      subscribe: (event, cb) => emitter.on(event, cb),
      unsubscribe: (event, cb) => emitter.off(event, cb),
      close: () => emitter.clear(),
      get connected() { return false; },
      get url() { return ''; }
    };
    return api;
  }

  const emitter = createEmitter();
  let ws;
  let connected = false;

  try {
    ws = new WebSocket(env.wsUrl);
  } catch (e) {
    // Emit error and return no-op-like client
    setTimeout(() => emitter.emit('error', e), 0);
    const api = {
      subscribe: (event, cb) => emitter.on(event, cb),
      unsubscribe: (event, cb) => emitter.off(event, cb),
      close: () => emitter.clear(),
      get connected() { return false; },
      get url() { return env.wsUrl; }
    };
    return api;
  }

  ws.addEventListener('open', () => {
    connected = true;
    emitter.emit('open', { url: env.wsUrl });
  });

  ws.addEventListener('close', (ev) => {
    connected = false;
    emitter.emit('close', { code: ev.code, reason: ev.reason });
  });

  ws.addEventListener('error', (ev) => {
    emitter.emit('error', ev);
  });

  ws.addEventListener('message', (ev) => {
    const payload = typeof ev.data === 'string' ? safeParseJson(ev.data) : ev.data;
    emitter.emit('message', payload);

    // If the payload is an object with a 'type', also emit on that channel for convenience
    if (payload && typeof payload === 'object' && payload.type) {
      emitter.emit(String(payload.type), payload);
    }
  });

  const api = {
    // PUBLIC_INTERFACE
    subscribe(event, cb) {
      /** Subscribe to a named event stream (e.g., 'message', 'open', 'close', backend 'run_update'). */
      return emitter.on(event, cb);
    },
    // PUBLIC_INTERFACE
    unsubscribe(event, cb) {
      /** Unsubscribe a previously registered callback for an event. */
      emitter.off(event, cb);
    },
    // PUBLIC_INTERFACE
    close() {
      /** Close the WebSocket connection and clear local handlers. */
      try { ws && ws.close(); } catch { /* ignore */ }
      emitter.clear();
    },
    get connected() { return connected; },
    get url() { return env.wsUrl; }
  };

  return api;
}
