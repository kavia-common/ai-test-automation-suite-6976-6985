import React, { useEffect, useMemo, useState } from 'react';
import { getHealth } from './api/client';
import { getAppEnv, getFeatureFlag } from './utils/env';
import './App.css';
import TestCasesPage from './pages/TestCases';
import TestAuthoringPage from './pages/TestAuthoring';
import { ToastProvider } from './components/Toaster';
import { useToasts } from './components/Toaster';
import { listAllTestCases, triggerTestRun, getTestRun, getTestRunLogs, cancelTestRun } from './api/testRuns';
import { connectRunEvents } from './api/ws';

/**
 * Simple hash-based router without external dependencies.
 * It listens to hashchange and maps the location.hash to a route key.
 */
function useHashRoute(defaultRoute = 'dashboard') {
  const getRoute = () => {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    return hash || defaultRoute;
  };
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [route, (r) => { window.location.hash = `#/${r}`; }];
}

/**
 * Theme hook to manage light/dark mode and persist to localStorage.
 */
function useTheme(initial = 'light') {
  const [theme, setTheme] = useState(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('theme') : null;
    return saved || initial;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem('theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  return [theme, setTheme];
}

/**
 * Corporate Navy theme CSS variables are defined at runtime and complement App.css defaults.
 * We apply them on the root element to allow global usage.
 */
function useCorporateNavyThemeVars() {
  useEffect(() => {
    const root = document.documentElement;
    const vars = {
      '--cn-primary': '#1E3A8A', // Navy
      '--cn-secondary': '#F59E0B', // Gold/Amber
      '--cn-success': '#059669',
      '--cn-error': '#DC2626',
      '--cn-bg': '#F3F4F6', // background
      '--cn-surface': '#FFFFFF', // surface
      '--cn-text': '#111827', // text
      '--cn-muted': '#6B7280',
      '--cn-border': '#E5E7EB',
      '--cn-shadow': '0 2px 6px rgba(0,0,0,0.06)',
      '--cn-shadow-lg': '0 10px 15px rgba(0,0,0,0.08)',
      '--sidebar-width': '260px'
    };
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }, []);
}

/* ---------- Layout Components ---------- */

/**
 * Sidebar component with navigation links. Highlights the active route.
 */
// PUBLIC_INTERFACE
function Sidebar({ currentRoute, onNavigate }) {
  /** Sidebar navigation for the application. */
  const items = useMemo(() => ([
    { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { key: 'test-cases', label: 'Test Cases', icon: '🧪' },
    { key: 'test-authoring', label: 'Test Authoring', icon: '✍️' },
    { key: 'test-runs', label: 'Test Runs', icon: '🏃' },
    { key: 'results', label: 'Results', icon: '📊' },
  ]), []);

  return (
    <aside className="cn-sidebar" aria-label="Sidebar Navigation">
      <div className="cn-brand">
        <div className="cn-logo" aria-hidden="true">🧪</div>
        <div className="cn-brand-text">
          <div className="cn-brand-name">AI Test Suite</div>
          <div className="cn-brand-sub">Corporate Navy</div>
        </div>
      </div>
      <nav className="cn-nav">
        {items.map(item => (
          <button
            key={item.key}
            className={`cn-nav-item ${currentRoute === item.key ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
            aria-current={currentRoute === item.key ? 'page' : undefined}
          >
            <span className="cn-nav-ico" aria-hidden="true">{item.icon}</span>
            <span className="cn-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="cn-sidebar-footer">
        <small>v0.1.0</small>
      </div>
    </aside>
  );
}

/**
 * TopBar component for page title and user actions.
 */
// PUBLIC_INTERFACE
function TopBar({ title, theme, onToggleTheme }) {
  /** Top application bar with title and theme toggle */
  return (
    <header className="cn-topbar">
      <h1 className="cn-topbar-title">{title}</h1>
      <div className="cn-topbar-actions">
        <button className="cn-btn ghost" onClick={onToggleTheme} aria-label="Toggle Theme">
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
        <button className="cn-avatar" aria-label="User menu">AK</button>
      </div>
    </header>
  );
}

/* ---------- Pages ---------- */

function Section({ title, description, children }) {
  return (
    <section className="cn-section">
      <div className="cn-section-header">
        <h2>{title}</h2>
        {description && <p className="cn-muted">{description}</p>}
      </div>
      <div className="cn-section-body">{children}</div>
    </section>
  );
}

// PUBLIC_INTERFACE
function DashboardPage() {
  /** Landing dashboard with quick stats, health status, and shortcuts. */
  const env = getAppEnv();
  const [health, setHealth] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();

    async function fetchHealth() {
      setHealth({ loading: true, error: null, data: null });
      try {
        const res = await getHealth({ signal: controller.signal });
        if (!aborted) setHealth({ loading: false, error: null, data: res });
      } catch (e) {
        if (aborted) return;
        // Normalize error structure
        setHealth({
          loading: false,
          error: {
            message: e?.message || 'Health check failed',
            status: e?.status,
            detail: e?.detail
          },
          data: null
        });
      }
    }
    fetchHealth();

    return () => {
      aborted = true;
      try { controller.abort(); } catch { /* ignore */ }
    };
  }, []);

  const renderHealthCard = () => {
    if (health.loading) {
      return (
        <div className="cn-card">
          <h3>API Health</h3>
          <p className="cn-muted">Checking health at</p>
          <p className="cn-kpi">...</p>
          <small className="cn-muted">
            {env.apiBase || '(same-origin)'}
            {` ${env.healthcheckPath || '/'}`}
          </small>
        </div>
      );
    }
    if (health.error) {
      return (
        <div className="cn-card">
          <h3>API Health</h3>
          <p className="cn-kpi error">Unavailable</p>
          <p className="cn-muted">
            {env.apiBase || '(same-origin)'}
            {` ${env.healthcheckPath || '/'}`}
          </p>
          <div className="cn-muted" style={{ marginTop: 8 }}>
            <div>Reason: {health.error.message}</div>
            {health.error.status != null && <div>Status: {health.error.status}</div>}
          </div>
          <div className="cn-actions" style={{ marginTop: 10 }}>
            <button
              className="cn-btn small"
              onClick={() => {
                setHealth(s => ({ ...s, loading: true }));
                const controller = new AbortController();
                getHealth({ signal: controller.signal })
                  .then(res => setHealth({ loading: false, error: null, data: res }))
                  .catch(e => setHealth({
                    loading: false,
                    error: { message: e?.message || 'Health check failed', status: e?.status, detail: e?.detail },
                    data: null
                  }));
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    const payload = health.data;
    const statusText =
      (payload && (payload.status || payload.state || payload.health || payload.ok)) ?? 'OK';
    const isOk =
      String(statusText).toLowerCase() === 'ok' ||
      String(statusText).toLowerCase() === 'healthy' ||
      statusText === true;

    return (
      <div className="cn-card">
        <h3>API Health</h3>
        <p className={`cn-kpi ${isOk ? 'ok' : 'warn'}`}>{String(statusText)}</p>
        <p className="cn-muted">
          {env.apiBase || '(same-origin)'}
          {` ${env.healthcheckPath || '/'}`}
        </p>
      </div>
    );
  };

  return (
    <div className="cn-grid">
      {renderHealthCard()}
      <div className="cn-card">
        <h3>Active Test Runs</h3>
        <p className="cn-kpi">3</p>
        <p className="cn-muted">Running across 2 environments</p>
      </div>
      <div className="cn-card">
        <h3>Flaky Tests</h3>
        <p className="cn-kpi warn">12</p>
        <p className="cn-muted">Investigate intermittent failures</p>
      </div>
      <div className="cn-card">
        <h3>Pass Rate (7d)</h3>
        <p className="cn-kpi ok">92%</p>
        <p className="cn-muted">Target: ≥ 95%</p>
      </div>
      <div className="cn-card wide">
        <h3>Recent Activity</h3>
        <ul className="cn-list">
          <li>🚀 Run #284 started on main</li>
          <li>🧠 AI suggested update for "Checkout flow"</li>
          <li>✅ Run #283 completed: 124 passed, 6 failed</li>
        </ul>
      </div>
    </div>
  );
}



// PUBLIC_INTERFACE
function TestRunsPage() {
  /**
   * Launch and monitor test runs.
   * Behavior:
   * - Lists test cases for selection
   * - Triggers runs via REST
   * - If feature flag WS is enabled and wsUrl present, subscribe to WebSocket events:
   *    run_started, log, run_updated, run_completed (generic 'message' also handled)
   * - Maintain REST polling as fallback when WS is disabled or unavailable
   * - Display connection status indicator and clean up subscriptions on unmount
   */
  const toasts = useToasts();

  const [testsLoading, setTestsLoading] = useState(true);
  const [testsError, setTestsError] = useState(null);
  const [tests, setTests] = useState([]);

  const [selectedTestId, setSelectedTestId] = useState('');
  const [suite, setSuite] = useState('Smoke');
  const [environment, setEnvironment] = useState('Staging');

  const [runId, setRunId] = useState(null);
  const [runStatus, setRunStatus] = useState(null);
  const [runError, setRunError] = useState(null);

  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  // WS state
  const env = getAppEnv();
  const wsFeatureOn = getFeatureFlag('WS', false);
  const wsEnabled = wsFeatureOn && !!env.wsUrl;
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState(null);

  // Load available test cases
  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();
    async function load() {
      setTestsLoading(true);
      setTestsError(null);
      try {
        const res = await listAllTestCases({ signal: controller.signal });
        if (aborted) return;
        const arr = Array.isArray(res) ? res : [];
        setTests(arr);
        if (!selectedTestId && arr.length > 0) {
          const firstId = arr[0].id ?? arr[0]._id ?? arr[0].uuid ?? arr[0].name;
          if (firstId) setSelectedTestId(String(firstId));
        }
      } catch (e) {
        if (aborted) return;
        setTestsError(e);
      } finally {
        if (!aborted) setTestsLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
      try { controller.abort(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // REST polling fallback
  useEffect(() => {
    if (!runId) return;
    let statusTimer = null;
    let logsTimer = null;
    let disposed = false;

    const fetchStatus = async () => {
      try {
        const data = await getTestRun(runId);
        if (disposed) return;
        const status = data?.status || data?.state || 'unknown';
        setRunStatus(status);
        setLastRefreshedAt(Date.now());
        const low = String(status).toLowerCase();
        if (['completed', 'failed', 'cancelled', 'canceled', 'passed', 'error'].includes(low)) {
          setIsRunning(false);
          if (statusTimer) clearInterval(statusTimer);
          if (logsTimer) clearInterval(logsTimer);
        }
      } catch (e) {
        if (disposed) return;
        setRunError(e);
      }
    };

    const fetchLogs = async () => {
      try {
        const data = await getTestRunLogs(runId);
        if (disposed) return;
        let lines = [];
        if (Array.isArray(data)) {
          lines = data.map((x) => String(x));
        } else if (typeof data === 'string') {
          lines = data.split(/\r?\n/);
        } else if (data && typeof data === 'object' && Array.isArray(data.items)) {
          lines = data.items.map((x) => String(x));
        }
        setLogs(lines);
      } catch (e) {
        if (disposed) return;
        setRunError((prev) => prev || e);
      }
    };

    // Start polling
    fetchStatus();
    fetchLogs();
    statusTimer = setInterval(fetchStatus, 2000);
    logsTimer = setInterval(fetchLogs, 1500);

    // If WS becomes connected, stop logs polling to avoid duplicates
    const maybeStopLogsPolling = () => {
      if (wsEnabled && wsConnected && logsTimer) {
        clearInterval(logsTimer);
        logsTimer = null;
      }
    };
    maybeStopLogsPolling();

    return () => {
      disposed = true;
      if (statusTimer) clearInterval(statusTimer);
      if (logsTimer) clearInterval(logsTimer);
    };
  }, [runId, wsEnabled, wsConnected]);

  // WebSocket subscription wiring
  useEffect(() => {
    if (!wsEnabled) {
      setWsConnected(false);
      setWsError(null);
      return;
    }
    const client = connectRunEvents();
    const offOpen = client.subscribe('open', () => {
      setWsConnected(true);
      setWsError(null);
    });
    const offClose = client.subscribe('close', () => {
      setWsConnected(false);
    });
    const offErr = client.subscribe('error', (e) => {
      setWsError(e);
      setWsConnected(false);
    });

    // Event handlers
    const onRunStarted = (msg) => {
      if (msg?.run_id) {
        const id = String(msg.run_id);
        setRunId((prev) => prev || id);
        setRunStatus('running');
        setIsRunning(true);
      }
    };
    const onRunUpdated = (msg) => {
      if (!msg?.run_id) return;
      const id = String(msg.run_id);
      if (runId && String(runId) !== id) return;
      if (!runId) setRunId(id);
      const status = msg?.status || msg?.state;
      if (status) {
        setRunStatus(status);
        setLastRefreshedAt(Date.now());
      }
    };
    const onRunCompleted = (msg) => {
      if (!msg?.run_id) return;
      const id = String(msg.run_id);
      if (runId && String(runId) !== id) return;
      const status = msg?.status || 'completed';
      setRunStatus(status);
      setIsRunning(false);
      setLastRefreshedAt(Date.now());
    };
    const onLog = (msg) => {
      if (msg?.run_id && runId && String(runId) !== String(msg.run_id)) return;
      if (typeof msg?.message === 'string') {
        setLogs((prev) => [...prev, msg.message]);
      } else if (Array.isArray(msg?.lines)) {
        const lines = msg.lines.map((x) => String(x));
        setLogs((prev) => [...prev, ...lines]);
      }
    };
    const onMessage = (payload) => {
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'run_started') onRunStarted(payload);
      else if (payload.type === 'run_updated') onRunUpdated(payload);
      else if (payload.type === 'run_completed') onRunCompleted(payload);
      else if (payload.type === 'log') onLog(payload);
    };

    const offStarted = client.subscribe('run_started', onRunStarted);
    const offUpdated = client.subscribe('run_updated', onRunUpdated);
    const offCompleted = client.subscribe('run_completed', onRunCompleted);
    const offLog = client.subscribe('log', onLog);
    const offMsg = client.subscribe('message', onMessage);

    return () => {
      offOpen?.();
      offClose?.();
      offErr?.();
      offStarted?.();
      offUpdated?.();
      offCompleted?.();
      offLog?.();
      offMsg?.();
      client.close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsEnabled, runId]);

  const handleTriggerRun = async () => {
    if (!selectedTestId) {
      toasts.error('Please select a test case to run.');
      return;
    }
    setRunError(null);
    setIsRunning(true);
    setRunId(null);
    setRunStatus('starting');
    setLogs([]);

    try {
      const res = await triggerTestRun({
        testCaseId: selectedTestId,
        metadata: { suite, environment },
      });
      const id = res?.id ?? res?.run_id ?? res?.uuid;
      if (!id) {
        throw new Error('Backend did not return a run id');
      }
      setRunId(String(id));
      setRunStatus(res?.status || 'queued');
      toasts.info(`Run ${id} started`, 'Run started');
    } catch (e) {
      setIsRunning(false);
      setRunStatus(null);
      setRunId(null);
      setRunError(e);
      const status = e?.status;
      if (!status || (status >= 500 || status === 404)) {
        toasts.error('Backend not ready for test runs yet. Please try again later.');
      } else {
        toasts.error(e?.message || 'Failed to start run');
      }
    }
  };

  const handleCancel = async () => {
    if (!runId) return;
    setIsCancelling(true);
    try {
      await cancelTestRun(runId);
      toasts.info(`Cancel requested for run ${runId}`);
    } catch (e) {
      toasts.error(e?.message || 'Cancel not supported or failed');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRefresh = async () => {
    if (!runId) {
      setTestsLoading(true);
      setTestsError(null);
      try {
        const res = await listAllTestCases();
        const arr = Array.isArray(res) ? res : [];
        setTests(arr);
      } catch (e) {
        setTestsError(e);
      } finally {
        setTestsLoading(false);
      }
      return;
    }
    try {
      const data = await getTestRun(runId);
      const status = data?.status || data?.state || runStatus;
      setRunStatus(status);
      setLastRefreshedAt(Date.now());
      const logData = await getTestRunLogs(runId);
      let lines = [];
      if (Array.isArray(logData)) {
        lines = logData.map((x) => String(x));
      } else if (typeof logData === 'string') {
        lines = logData.split(/\r?\n/);
      } else if (logData && typeof logData === 'object' && Array.isArray(logData.items)) {
        lines = logData.items.map((x) => String(x));
      }
      setLogs(lines);
    } catch (e) {
      setRunError(e);
    }
  };

  const statusBadge = (status) => {
    if (!status) return <span className="cn-badge info">-</span>;
    const s = String(status).toLowerCase();
    if (['passed', 'success', 'completed'].includes(s)) return <span className="cn-badge ok">{status}</span>;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) return <span className="cn-badge error">{status}</span>;
    return <span className="cn-badge info">{status}</span>;
  };

  const ConnectionIndicator = () => {
    if (!wsFeatureOn) {
      return <span className="cn-badge warn" title="WebSocket feature disabled via flags">WS off</span>;
    }
    if (!env.wsUrl) {
      return <span className="cn-badge warn" title="REACT_APP_WS_URL not set and cannot be derived">WS unavailable</span>;
    }
    if (wsError) {
      return <span className="cn-badge error" title="WebSocket error occurred">WS error</span>;
    }
    return wsConnected
      ? <span className="cn-badge ok" title={`Connected to ${env.wsUrl}`}>WS live</span>
      : <span className="cn-badge info" title="Attempting to connect">WS connecting</span>;
  };

  const renderLauncher = (
    <div className="cn-form">
      <label className="cn-field">
        <span>Test Case</span>
        {testsLoading && <div className="cn-muted">Loading test cases...</div>}
        {testsError && (
          <div className="cn-muted" style={{ color: 'var(--cn-error, #DC2626)' }}>
            {testsError?.message || 'Failed to load test cases. The backend may not be ready.'}
          </div>
        )}
        {!testsLoading && !testsError && (
          <select
            value={selectedTestId}
            onChange={(e) => setSelectedTestId(e.target.value)}
            aria-label="Select test case"
          >
            {tests.length === 0 && <option value="">No test cases available</option>}
            {tests.map((t) => {
              const id = t.id ?? t._id ?? t.uuid ?? t.name;
              return (
                <option key={String(id)} value={String(id)}>
                  {t.name || id}
                </option>
              );
            })}
          </select>
        )}
      </label>
      <label className="cn-field">
        <span>Suite</span>
        <select value={suite} onChange={(e) => setSuite(e.target.value)}>
          <option>Smoke</option>
          <option>Regression</option>
          <option>Full</option>
        </select>
      </label>
      <label className="cn-field">
        <span>Environment</span>
        <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
          <option>Staging</option>
          <option>Production</option>
        </select>
      </label>
      <div className="cn-actions">
        <button className="cn-btn primary" onClick={handleTriggerRun} disabled={!selectedTestId || testsLoading || isRunning}>
          {isRunning && !runId ? 'Starting...' : 'Run'}
        </button>
        <button className="cn-btn ghost" onClick={handleRefresh}>Refresh</button>
        <span style={{ marginLeft: 'auto' }}><ConnectionIndicator /></span>
      </div>
      {(!testsLoading && tests.length === 0) && (
        <small className="cn-muted" style={{ marginTop: 8 }}>
          No tests to run. Create tests in the Test Cases page.
        </small>
      )}
    </div>
  );

  const renderMonitor = (
    <div className="cn-grid">
      <div className="cn-card">
        <h3>Run</h3>
        <div className="cn-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
          <div><strong>ID:</strong> {runId || '-'}</div>
          <div><strong>Status:</strong> {statusBadge(runStatus)}</div>
          {lastRefreshedAt && (
            <div className="cn-muted"><small>Last updated: {new Date(lastRefreshedAt).toLocaleTimeString()}</small></div>
          )}
        </div>
        <div className="cn-actions" style={{ marginTop: 10 }}>
          <button className="cn-btn" onClick={handleRefresh} disabled={!runId}>Refresh</button>
          <button className="cn-btn ghost" onClick={handleCancel} disabled={!runId || isCancelling}>
            {isCancelling ? 'Cancelling...' : 'Cancel'}
          </button>
        </div>
        {runError && (
          <div className="cn-muted" style={{ marginTop: 8, color: 'var(--cn-error, #DC2626)' }}>
            {runError?.message || 'Error occurred. The backend endpoints may not be available yet.'}
          </div>
        )}
      </div>
      <div className="cn-card wide">
        <h3>Logs</h3>
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            padding: 10,
            background: 'var(--bg-secondary)',
            height: 260,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace',
            fontSize: 12,
          }}
          aria-live="polite"
        >
          {logs.length === 0 ? (
            <div className="cn-muted">No logs yet.</div>
          ) : (
            logs.map((line, idx) => <div key={idx}>{line}</div>)
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Section title="Start a Run" description="Choose a test case and environment, then trigger a run.">
        {renderLauncher}
      </Section>
      <Section title="Monitor" description="Track status and view incremental logs.">
        {renderMonitor}
      </Section>
    </>
  );
}

// PUBLIC_INTERFACE
function ResultsPage() {
  /** Explore historical results and analytics. */
  return (
    <>
      <Section title="Filters" description="Refine results by suite, status and time.">
        <div className="cn-form grid">
          <label className="cn-field">
            <span>Status</span>
            <select>
              <option>All</option>
              <option>Passed</option>
              <option>Failed</option>
              <option>Flaky</option>
            </select>
          </label>
          <label className="cn-field">
            <span>Time Range</span>
            <select>
              <option>Last 24h</option>
              <option>7 days</option>
              <option>30 days</option>
            </select>
          </label>
          <div className="cn-actions">
            <button className="cn-btn">Apply</button>
          </div>
        </div>
      </Section>
      <Section title="Summary" description="Key metrics at a glance.">
        <div className="cn-grid">
          <div className="cn-card">
            <h3>Average Duration</h3>
            <p className="cn-kpi">12m 35s</p>
          </div>
          <div className="cn-card">
            <h3>Failure Rate</h3>
            <p className="cn-kpi error">8%</p>
          </div>
          <div className="cn-card">
            <h3>Flaky Tests</h3>
            <p className="cn-kpi warn">15</p>
          </div>
        </div>
      </Section>
    </>
  );
}

/**
 * Map route to page component and title.
 */
function resolveRoute(route) {
  switch (route) {
    case 'dashboard': return { title: 'Dashboard', component: <DashboardPage /> };
    case 'test-cases': return { title: 'Test Cases', component: <TestCasesPage /> };
    case 'test-authoring': return { title: 'Test Authoring', component: <TestAuthoringPage /> };
    case 'test-runs': return { title: 'Test Runs', component: <TestRunsPage /> };
    case 'results': return { title: 'Results', component: <ResultsPage /> };
    default: return { title: 'Not Found', component: <div className="cn-card">Page not found.</div> };
  }
}

// PUBLIC_INTERFACE
function App() {
  /** Root application component: provides layout, theme, and hash routing. */
  const [route, navigate] = useHashRoute('dashboard');
  const [theme, setTheme] = useTheme('light');
  useCorporateNavyThemeVars();

  const { title, component } = resolveRoute(route);

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ToastProvider>
      <div className="cn-app">
        <Sidebar currentRoute={route} onNavigate={navigate} />
        <main className="cn-main">
          <TopBar title={title} theme={theme} onToggleTheme={toggleTheme} />
          <div className="cn-content">{component}</div>
        </main>
      </div>
    </ToastProvider>
  );
}

export default App;
