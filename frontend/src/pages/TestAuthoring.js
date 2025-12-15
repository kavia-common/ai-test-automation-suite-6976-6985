import React, { useEffect, useMemo, useState } from 'react';
import { getFeatureFlag } from '../utils/env';
import { aiGenerateTest, createTestCase, updateTestCase, listTestCases } from '../api/client';
import { useToasts } from '../components/Toaster';

/**
 * Utilities
 */
function validateName(name) {
  if (!name || !name.trim()) return 'Name is required';
  if (name.trim().length < 3) return 'Name must be at least 3 characters';
  return '';
}

function normalizeSteps(val) {
  if (Array.isArray(val)) return val.map((s) => String(s));
  if (typeof val === 'string') {
    return val
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function joinSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((s, i) => `• ${String(s)}`).join('\n');
}

/**
 * AI Authoring Page:
 * - Hidden if experiments feature flag is off
 * - Inputs: Test Name, Prompt, (optional) Context/Constraints
 * - Calls backend AI authoring endpoint via aiGenerateTest()
 * - Renders rationale and suggested steps; user can edit steps and rationale
 * - Save as new test or update an existing test case (select from list)
 * - Loading/error states and toasts on success/failure
 */
// PUBLIC_INTERFACE
export default function TestAuthoring() {
  /** AI-assisted authoring experience for test cases. */
  const experimentsEnabled = getFeatureFlag('EXPERIMENTS_ENABLED', false);
  const toasts = useToasts();

  // Inputs
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState('');
  const [constraints, setConstraints] = useState('');
  const [tags, setTags] = useState(''); // comma separated

  // Generate state
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  // Output from AI (editable)
  const [rationale, setRationale] = useState('');
  const [stepsText, setStepsText] = useState(''); // plaintext list (one per line / bullets)

  // Test case update flow
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingError, setExistingError] = useState(null);
  const [existingTests, setExistingTests] = useState([]);
  const [targetMode, setTargetMode] = useState('new'); // 'new' | 'update'
  const [targetId, setTargetId] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);

  // Load existing test list for update dropdown
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    async function load() {
      setExistingLoading(true);
      setExistingError(null);
      try {
        const res = await listTestCases({}, { signal: controller.signal });
        if (disposed) return;
        const arr = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
        setExistingTests(arr);
        if (!targetId && arr.length > 0) {
          const firstId = arr[0].id ?? arr[0]._id ?? arr[0].uuid ?? arr[0].name;
          if (firstId) setTargetId(String(firstId));
        }
      } catch (e) {
        if (disposed) return;
        setExistingError(e);
      } finally {
        if (!disposed) setExistingLoading(false);
      }
    }
    load();
    return () => {
      disposed = true;
      try { controller.abort(); } catch { /* ignore */ }
    };
  }, [targetId]);

  const canGenerate = useMemo(() => {
    const nmErr = validateName(name);
    return !generating && !nmErr && prompt.trim().length > 0;
  }, [name, prompt, generating]);

  const handleGenerate = async () => {
    const nmErr = validateName(name);
    setNameError(nmErr);
    if (nmErr) {
      toasts.error('Please provide a valid Test Name.');
      return;
    }
    if (!prompt.trim()) {
      toasts.error('Please describe the scenario to generate steps.');
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      // Payload shape: match backend /api/ai/author expectations
      // We'll send: { prompt, context?, constraints?, name? }
      const payload = {
        name: name.trim(),
        prompt: prompt.trim(),
        ...(context.trim() ? { context: context.trim() } : {}),
        ...(constraints.trim() ? { constraints: constraints.trim() } : {}),
      };
      const res = await aiGenerateTest(payload);
      // Expected response: { suggested_steps: string[] or single string, rationale?: string, ... }
      const outSteps = normalizeSteps(res?.suggested_steps || res?.steps || res?.result?.steps || []);
      const outRationale =
        res?.rationale ||
        res?.reasoning ||
        res?.result?.rationale ||
        (res?.explanations?.length ? res.explanations.join('\n') : '');

      setStepsText(joinSteps(outSteps.length ? outSteps : ['Open the app', 'Perform main action', 'Assert expected result']));
      setRationale(outRationale || 'Draft rationale from AI. Review and refine as needed.');

      toasts.success('Draft generated. Review and edit before saving.');
    } catch (e) {
      setGenError(e);
      const status = e?.status;
      if (!status || status >= 500 || status === 404) {
        toasts.error('AI authoring backend not available yet. Try again later.');
      } else {
        toasts.error(e?.message || 'Failed to generate with AI');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    const nmErr = validateName(name);
    setNameError(nmErr);
    if (nmErr) {
      toasts.error('Please provide a valid Test Name.');
      return;
    }
    const steps = normalizeSteps(
      stepsText
        .replace(/^\s*[\u2022*-]\s*/gm, '') // remove bullet markers
    );
    if (steps.length === 0) {
      toasts.error('Please include at least one test step.');
      return;
    }
    const payload = {
      name: name.trim(),
      description: rationale ? String(rationale) : prompt.trim(),
      steps,
      tags: tags ? String(tags).split(',').map(s => s.trim()).filter(Boolean) : [],
      status: 'Ready'
    };

    setSaving(true);
    try {
      if (targetMode === 'update') {
        if (!targetId) {
          toasts.error('Please select an existing Test Case to update.');
          setSaving(false);
          return;
        }
        const updated = await updateTestCase(targetId, payload);
        toasts.success(`Updated test case "${updated?.name || name}".`);
      } else {
        const created = await createTestCase(payload);
        toasts.success(`Created new test case "${created?.name || name}".`);
      }
    } catch (e) {
      toasts.error(e?.message || 'Failed to save test case');
    } finally {
      setSaving(false);
    }
  };

  if (!experimentsEnabled) {
    return (
      <section className="cn-section">
        <div className="cn-section-header">
          <h2>Test Authoring</h2>
          <p className="cn-muted">AI authoring is currently disabled by feature flag.</p>
        </div>
        <div className="cn-section-body">
          <div className="cn-card">
            <div className="cn-muted">
              Set REACT_APP_FEATURE_FLAGS to include "EXPERIMENTS_ENABLED=true" to enable this page.
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="cn-section">
        <div className="cn-section-header">
          <h2>AI Test Authoring</h2>
          <p className="cn-muted">Describe a scenario and let AI draft steps. You can edit before saving.</p>
        </div>
        <div className="cn-section-body">
          <div className="cn-card">
            <div className="cn-form">
              <label className="cn-field">
                <span>Test Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (nameError) setNameError(''); }}
                  placeholder="e.g., Add item to cart and checkout"
                  aria-invalid={!!nameError}
                  aria-describedby="err-name"
                />
                {nameError && <small id="err-name" className="cn-muted" style={{ color: 'var(--cn-error, #DC2626)' }}>{nameError}</small>}
              </label>
              <label className="cn-field">
                <span>Prompt</span>
                <textarea
                  rows="4"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the user flow and acceptance criteria..."
                />
              </label>
              <div className="cn-form grid">
                <label className="cn-field">
                  <span>Context (optional)</span>
                  <textarea
                    rows="3"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Environment details, data setup, business rules..."
                  />
                </label>
                <label className="cn-field">
                  <span>Constraints (optional)</span>
                  <textarea
                    rows="3"
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="Limit scope, specify frameworks/tools, non-functional requirements..."
                  />
                </label>
                <label className="cn-field">
                  <span>Tags (comma separated)</span>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="smoke, checkout"
                  />
                </label>
              </div>
              <div className="cn-actions">
                <button className="cn-btn primary" onClick={handleGenerate} disabled={!canGenerate}>
                  {generating ? 'Generating…' : 'Generate with AI'}
                </button>
                <button
                  className="cn-btn ghost"
                  onClick={() => { setPrompt(''); setContext(''); setConstraints(''); setRationale(''); setStepsText(''); setGenError(null); }}
                  disabled={generating}
                >
                  Clear
                </button>
              </div>
              {genError && (
                <div className="cn-muted" style={{ marginTop: 8, color: 'var(--cn-error, #DC2626)' }}>
                  {genError?.message || 'Generation failed'}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="cn-section">
        <div className="cn-section-header">
          <h2>Draft</h2>
          <p className="cn-muted">Review and refine the generated rationale and steps.</p>
        </div>
        <div className="cn-section-body">
          <div className="cn-grid">
            <div className="cn-card">
              <h3>Rationale</h3>
              <textarea
                rows="8"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="AI reasoning behind the steps will appear here..."
                style={{ width: '100%' }}
              />
            </div>
            <div className="cn-card">
              <h3>Steps</h3>
              <textarea
                rows="12"
                value={stepsText}
                onChange={(e) => setStepsText(e.target.value)}
                placeholder={'• Step 1\n• Step 2\n• Step 3'}
                style={{ width: '100%' }}
              />
              <small className="cn-muted">Tip: One step per line. Bullet markers will be normalized automatically.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="cn-section">
        <div className="cn-section-header">
          <h2>Save</h2>
          <p className="cn-muted">Save as a new test case or update an existing one.</p>
        </div>
        <div className="cn-section-body">
          <div className="cn-card">
            <div className="cn-form">
              <div className="cn-actions" style={{ gap: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="saveMode"
                    value="new"
                    checked={targetMode === 'new'}
                    onChange={() => setTargetMode('new')}
                  />
                  <span>Save as new Test Case</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="saveMode"
                    value="update"
                    checked={targetMode === 'update'}
                    onChange={() => setTargetMode('update')}
                  />
                  <span>Update existing</span>
                </label>
              </div>

              {targetMode === 'update' && (
                <label className="cn-field">
                  <span>Existing Test Case</span>
                  {existingLoading && <div className="cn-muted">Loading test cases...</div>}
                  {existingError && (
                    <div className="cn-muted" style={{ color: 'var(--cn-error, #DC2626)' }}>
                      {existingError?.message || 'Failed to load test cases.'}
                    </div>
                  )}
                  {!existingLoading && !existingError && (
                    <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                      {existingTests.length === 0 && <option value="">No test cases available</option>}
                      {existingTests.map((t) => {
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
              )}

              <div className="cn-actions">
                <button className="cn-btn primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : (targetMode === 'update' ? 'Update Test Case' : 'Create Test Case')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
