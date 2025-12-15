//
// REST API client utilities
// Centralized fetch wrappers with environment-aware base URL.
//
// Note: This file assumes a backend that exposes resources for:
// - health check
// - test cases CRUD
// - runs start/list/get
// - logs for runs
// - AI authoring endpoints
//
// All public functions are annotated with PUBLIC_INTERFACE.
//

import { apiUrl, healthUrl } from '../utils/env';

// Basic JSON fetch wrapper with error handling and optional signal
async function requestJson(url, { method = 'GET', headers = {}, body, signal } = {}) {
  const finalHeaders = {
    'Accept': 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers
  };
  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    signal
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errDetail = undefined;
    if (isJson) {
      try { errDetail = await res.json(); } catch { /* ignore */ }
    } else {
      try { errDetail = await res.text(); } catch { /* ignore */ }
    }
    const error = new Error(`HTTP ${res.status} ${res.statusText}`);
    error.status = res.status;
    error.detail = errDetail;
    throw error;
  }
  if (isJson) return res.json();
  return res.text();
}

// PUBLIC_INTERFACE
export async function getHealth(options = {}) {
  /** Ping backend health endpoint. Returns parsed JSON or text. */
  return requestJson(healthUrl(), { ...options });
}

// ---------- Test Cases ----------

// PUBLIC_INTERFACE
export async function listTestCases({ page, pageSize } = {}, options = {}) {
  /** List test cases with optional pagination. */
  const params = new URLSearchParams();
  if (page != null) params.set('page', page);
  if (pageSize != null) params.set('page_size', pageSize);
  const url = apiUrl(`/tests${params.toString() ? `?${params}` : ''}`);
  return requestJson(url, { ...options });
}

// PUBLIC_INTERFACE
export async function getTestCase(id, options = {}) {
  /** Get a single test case by id. */
  const url = apiUrl(`/tests/${encodeURIComponent(id)}`);
  return requestJson(url, { ...options });
}

// PUBLIC_INTERFACE
export async function createTestCase(payload, options = {}) {
  /** Create a new test case. payload is an object with test details. */
  const url = apiUrl('/tests');
  return requestJson(url, { method: 'POST', body: payload, ...options });
}

// PUBLIC_INTERFACE
export async function updateTestCase(id, payload, options = {}) {
  /** Update an existing test case by id. */
  const url = apiUrl(`/tests/${encodeURIComponent(id)}`);
  return requestJson(url, { method: 'PUT', body: payload, ...options });
}

// PUBLIC_INTERFACE
export async function deleteTestCase(id, options = {}) {
  /** Delete a test case by id. */
  const url = apiUrl(`/tests/${encodeURIComponent(id)}`);
  return requestJson(url, { method: 'DELETE', ...options });
}

// ---------- Test Runs ----------

// PUBLIC_INTERFACE
export async function startRun(payload, options = {}) {
  /** Start a new run with the provided payload (e.g., suite, env, selected tests). */
  const url = apiUrl('/runs');
  return requestJson(url, { method: 'POST', body: payload, ...options });
}

// PUBLIC_INTERFACE
export async function listRuns({ page, pageSize } = {}, options = {}) {
  /** List recent runs with optional pagination. */
  const params = new URLSearchParams();
  if (page != null) params.set('page', page);
  if (pageSize != null) params.set('page_size', pageSize);
  const url = apiUrl(`/runs${params.toString() ? `?${params}` : ''}`);
  return requestJson(url, { ...options });
}

// PUBLIC_INTERFACE
export async function getRun(id, options = {}) {
  /** Get a single run by id. */
  const url = apiUrl(`/runs/${encodeURIComponent(id)}`);
  return requestJson(url, { ...options });
}

// PUBLIC_INTERFACE
export async function getRunLogs(id, options = {}) {
  /** Get logs for a run by id. */
  const url = apiUrl(`/runs/${encodeURIComponent(id)}/logs`);
  return requestJson(url, { ...options });
}

// ---------- AI Authoring ----------

// PUBLIC_INTERFACE
export async function aiGenerateTest(payload, options = {}) {
  /** Ask AI to generate a test draft from a scenario description. */
  const url = apiUrl('/ai/author/generate');
  return requestJson(url, { method: 'POST', body: payload, ...options });
}

// PUBLIC_INTERFACE
export async function aiImproveTest(id, payload, options = {}) {
  /** Ask AI to improve an existing test case by id. */
  const url = apiUrl(`/ai/author/${encodeURIComponent(id)}/improve`);
  return requestJson(url, { method: 'POST', body: payload, ...options });
}
