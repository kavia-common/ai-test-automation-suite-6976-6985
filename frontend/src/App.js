import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

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
  /** Landing dashboard with quick stats and shortcuts. */
  return (
    <div className="cn-grid">
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
function TestAuthoringPage() {
  /** Author and manage AI-assisted test cases. */
  return (
    <>
      <Section title="New Test" description="Describe the scenario and let AI draft steps.">
        <div className="cn-form">
          <label className="cn-field">
            <span>Test Name</span>
            <input type="text" placeholder="e.g., Add item to cart and checkout" />
          </label>
          <label className="cn-field">
            <span>Scenario Description</span>
            <textarea rows="4" placeholder="Describe the user flow and acceptance criteria..." />
          </label>
          <div className="cn-actions">
            <button className="cn-btn primary">Generate with AI</button>
            <button className="cn-btn">Save Draft</button>
          </div>
        </div>
      </Section>
      <Section title="Your Tests" description="Quick access to existing tests.">
        <div className="cn-table">
          <div className="cn-table-row cn-table-head">
            <div>Name</div><div>Last Updated</div><div>Status</div><div>Actions</div>
          </div>
          <div className="cn-table-row">
            <div>Login flow</div><div>Today</div><div><span className="cn-badge ok">Ready</span></div>
            <div><button className="cn-btn small">Edit</button></div>
          </div>
          <div className="cn-table-row">
            <div>Checkout flow</div><div>Yesterday</div><div><span className="cn-badge warn">Needs Review</span></div>
            <div><button className="cn-btn small">Edit</button></div>
          </div>
        </div>
      </Section>
    </>
  );
}

// PUBLIC_INTERFACE
function TestRunsPage() {
  /** Launch and monitor test runs. */
  return (
    <>
      <Section title="Start a Run" description="Select tests and environment to execute.">
        <div className="cn-form">
          <label className="cn-field">
            <span>Suite</span>
            <select>
              <option>Smoke</option>
              <option>Regression</option>
              <option>Full</option>
            </select>
          </label>
          <label className="cn-field">
            <span>Environment</span>
            <select>
              <option>Staging</option>
              <option>Production</option>
            </select>
          </label>
          <div className="cn-actions">
            <button className="cn-btn primary">Run</button>
            <button className="cn-btn ghost">Schedule</button>
          </div>
        </div>
      </Section>
      <Section title="Recent Runs" description="Latest runs and statuses.">
        <div className="cn-table">
          <div className="cn-table-row cn-table-head">
            <div>ID</div><div>Suite</div><div>Env</div><div>Status</div>
          </div>
          <div className="cn-table-row">
            <div>#284</div><div>Smoke</div><div>Staging</div><div><span className="cn-badge info">Running</span></div>
          </div>
          <div className="cn-table-row">
            <div>#283</div><div>Regression</div><div>Staging</div><div><span className="cn-badge ok">Passed</span></div>
          </div>
          <div className="cn-table-row">
            <div>#282</div><div>Full</div><div>Prod</div><div><span className="cn-badge error">Failed</span></div>
          </div>
        </div>
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
    <div className="cn-app">
      <Sidebar currentRoute={route} onNavigate={navigate} />
      <main className="cn-main">
        <TopBar title={title} theme={theme} onToggleTheme={toggleTheme} />
        <div className="cn-content">{component}</div>
      </main>
    </div>
  );
}

export default App;
