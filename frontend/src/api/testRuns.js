//
// Specific API helpers for Test Runs feature (M3)
// Wraps endpoints as described in the milestone request.
//
// PUBLIC INTERFACE FUNCTIONS are annotated accordingly.
//

import { apiUrl } from '../utils/env';

// Internal generic JSON request helper for this module
async function requestJson(url, { method = 'GET', headers = {}, body, signal } = {}) {
  const finalHeaders = {
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  };
  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errDetail = undefined;
    if (isJson) {
      try {
        errDetail = await res.json();
      } catch {
        /* ignore */
      }
    } else {
      try {
        errDetail = await res.text();
      } catch {
        /* ignore */
      }
    }
    const error = new Error(`HTTP ${res.status} ${res.statusText}`);
    error.status = res.status;
    error.detail = errDetail;
    throw error;
  }
  if (isJson) return res.json();
  return res.text();
}

// ---------- Test Cases (for run selection) ----------

// PUBLIC_INTERFACE
export async function listAllTestCases(options = {}) {
  /** List available test cases for runs. Falls back to [] if API absent. */
  const url = apiUrl('/tests');
  try {
    const res = await requestJson(url, { ...options });
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.items)) return res.items;
    return [];
  } catch (e) {
    // Graceful fallback
    const err = new Error(e?.message || 'Failed to list test cases');
    err.status = e?.status;
    throw err;
  }
}

// ---------- Test Runs ----------

// PUBLIC_INTERFACE
export async function triggerTestRun({ testCaseId, metadata } = {}, options = {}) {
  /**
   * Trigger a test run for a selected test case by POST /api/test-runs
   * Payload example: { test_case_id: string, metadata?: object }
   * Returns: { id, status, ... }
   */
  const url = apiUrl('/test-runs');
  const payload = { test_case_id: testCaseId, ...(metadata ? { metadata } : {}) };
  return requestJson(url, { method: 'POST', body: payload, ...options });
}

// PUBLIC_INTERFACE
export async function getTestRun(id, options = {}) {
  /** Fetch a run by GET /api/test-runs/{id} */
  const url = apiUrl(`/test-runs/${encodeURIComponent(id)}`);
  return requestJson(url, { ...options });
}

// PUBLIC_INTERFACE
export async function getTestRunLogs(id, options = {}) {
  /** Fetch run logs by GET /api/test-runs/{id}/logs; expect text or JSON array of lines */
  const url = apiUrl(`/test-runs/${encodeURIComponent(id)}/logs`);
  return requestJson(url, { ...options });
}

// PUBLIC_INTERFACE
export async function cancelTestRun(id, options = {}) {
  /** Optional: Cancel a run if backend supports it via POST /api/test-runs/{id}/cancel */
  const url = apiUrl(`/test-runs/${encodeURIComponent(id)}/cancel`);
  try {
    return await requestJson(url, { method: 'POST', ...options });
  } catch (e) {
    // Bubble up but as a standard Error with status
    const err = new Error(e?.message || 'Cancel request failed');
    err.status = e?.status;
    throw err;
  }
}
