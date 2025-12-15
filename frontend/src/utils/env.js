//
//
// Environment resolution utilities for the frontend
// Centralizes .env access with sane defaults and parsing.
//
// All public functions in this module are annotated with PUBLIC_INTERFACE
//

/**
 * Safely get a process env var (Create React App exposes REACT_APP_* at build time).
 * Wrap in a function to simplify testing and future framework changes.
 */
function getEnv(key, fallback = undefined) {
  const val = typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  return val !== undefined && val !== '' ? val : fallback;
}

/**
 * Normalize a base URL by trimming trailing slashes.
 */
function normalizeBaseUrl(url) {
  if (!url) return url;
  try {
    return url.replace(/\/*$/, '');
  } catch {
    return url;
  }
}

/**
 * Build a full URL by combining base and path, handling leading/trailing slashes.
 */
function joinUrl(base, path) {
  const b = normalizeBaseUrl(base || '');
  const p = String(path || '').replace(/^\/*/, '');
  if (!b) return `/${p}`;
  return `${b}/${p}`;
}

/**
 * Parse a comma or space separated string into an object of feature flags:
 * "featA, featB=true, featC=false" => { featA: true, featB: true, featC: false }
 */
function parseFeatureFlags(input) {
  const flags = {};
  if (!input) return flags;
  const items = String(input)
    .split(/[, \n\t]+/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const item of items) {
    const [rawKey, rawValue] = item.split('=');
    const key = String(rawKey || '').trim();
    if (!key) continue;
    const valueStr = (rawValue ?? 'true').trim().toLowerCase();
    const value = valueStr === 'true' || valueStr === '1' || valueStr === 'yes' || valueStr === 'on';
    flags[key] = value;
  }
  return flags;
}

// Detect NODE_ENV (CRA uses process.env.NODE_ENV). Fallback to 'development'.
const NODE_ENV = getEnv('NODE_ENV', 'development');

// Resolve base API URL. Preference order:
// 1) REACT_APP_API_BASE (most specific for API)
// 2) REACT_APP_BACKEND_URL (generic backend root)
// Default/fallback: http://localhost:3001 for smoother local dev
const API_BASE = normalizeBaseUrl(
  getEnv('REACT_APP_API_BASE') ||
  getEnv('REACT_APP_BACKEND_URL') ||
  'http://localhost:3001'
);

// Healthcheck path (default '/')
const HEALTHCHECK_PATH = getEnv('REACT_APP_HEALTHCHECK_PATH', '/');

// WebSocket URL. If not set, fallback to ws://localhost:3001/ws.
// If explicitly set to 'disabled' or empty, WS will be considered disabled.
function resolveWsUrl() {
  const explicit = (getEnv('REACT_APP_WS_URL', '') || '').trim();
  if (explicit.toLowerCase() === 'disabled') return '';
  if (explicit) return explicit;

  // Try to derive from API_BASE if it's absolute
  try {
    const api = new URL(API_BASE);
    const wsScheme = api.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsScheme}//${api.host}/ws`;
  } catch {
    // Fallback explicit localhost
    return 'ws://localhost:3001/ws';
  }
}
const WS_URL = resolveWsUrl();

// Feature flags
// Also honor REACT_APP_EXPERIMENTS_ENABLED= true/false by merging into flags
const FEATURE_FLAGS = {
  ...parseFeatureFlags(getEnv('REACT_APP_FEATURE_FLAGS', '')),
  ...(getEnv('REACT_APP_EXPERIMENTS_ENABLED') != null
    ? {
        EXPERIMENTS_ENABLED: ['1', 'true', 'yes', 'on'].includes(
          String(getEnv('REACT_APP_EXPERIMENTS_ENABLED')).toLowerCase()
        )
      }
    : {})
};

// PUBLIC_INTERFACE
export function getAppEnv() {
  /**
   * Returns normalized environment configuration used by the app.
   * - nodeEnv: build/runtime environment string (development|production|test)
   * - apiBase: normalized API base URL (no trailing slash)
   * - healthcheckPath: health endpoint path (default "/")
   * - wsUrl: full WebSocket URL; empty string indicates WS disabled
   * - featureFlags: object with normalized feature flags
   */
  return {
    nodeEnv: NODE_ENV,
    apiBase: API_BASE,
    healthcheckPath: HEALTHCHECK_PATH,
    wsUrl: WS_URL,
    featureFlags: FEATURE_FLAGS
  };
}

// PUBLIC_INTERFACE
export function apiUrl(path = '/') {
  /**
   * Compose a full API URL using apiBase and the provided path.
   */
  return joinUrl(API_BASE, path);
}

// PUBLIC_INTERFACE
export function healthUrl() {
  /**
   * Compose the healthcheck URL using apiBase and configured health path.
   */
  return joinUrl(API_BASE, HEALTHCHECK_PATH);
}

// PUBLIC_INTERFACE
export function isWsEnabled() {
  /**
   * Returns true when WebSocket URL is resolvable and not explicitly disabled.
   */
  return Boolean(WS_URL);
}

// PUBLIC_INTERFACE
export function getFeatureFlag(name, defaultValue = false) {
  /**
   * Returns a single feature flag by name with an optional default.
   */
  if (!name) return defaultValue;
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, name)
    ? FEATURE_FLAGS[name]
    : defaultValue;
}
