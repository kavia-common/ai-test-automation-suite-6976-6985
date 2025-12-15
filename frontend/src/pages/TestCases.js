import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listTestCases, createTestCase, updateTestCase, deleteTestCase } from '../api/client';
import { useToasts } from '../components/Toaster';

// Utilities for localStorage persistence of selected test IDs (used by TestRuns)
const LS_SELECTED_KEY = 'cn.selected.tests.v1';

function loadSelected() {
  try {
    const raw = window.localStorage.getItem(LS_SELECTED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
  } catch { /* ignore */ }
  return [];
}

function saveSelected(ids) {
  try {
    window.localStorage.setItem(LS_SELECTED_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

function emptyForm() {
  return {
    name: '',
    description: '',
    tags: '',
  };
}

function validate(form) {
  const errs = {};
  if (!form.name || !form.name.trim()) errs.name = 'Name is required';
  if (!form.description || !form.description.trim()) errs.description = 'Description is required';
  // tags optional
  return errs;
}

/**
 * TestCases page: full CRUD with optimistic updates and selection persistence.
 * - Lists test cases from API
 * - Create new test
 * - Edit existing test (inline modal-like form)
 * - Delete test with confirmation
 * - Select tests with checkboxes; persisted to localStorage for TestRuns page to use later
 */
// PUBLIC_INTERFACE
export default function TestCasesPage() {
  /** Manage Test Case CRUD and selections for runs. */
  const toasts = useToasts();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => loadSelected());
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const selectedCount = selectedIds.length;

  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();

    async function fetchList() {
      setLoading(true);
      setError(null);
      try {
        const res = await listTestCases({}, { signal: controller.signal });
        if (aborted) return;
        // Normalize shape; expect array of items. Fallback to [] if not.
        const arr = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
        setItems(arr);
      } catch (e) {
        if (aborted) return;
        setError(e);
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    fetchList();

    return () => {
      aborted = true;
      try { controller.abort(); } catch { /* ignore */ }
    };
  }, []);

  // Persist selection
  useEffect(() => { saveSelected(selectedIds); }, [selectedIds]);

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter(x => x !== id) : [...prev, id];
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (items.length === 0) return;
    const allIds = items.map(it => it.id ?? it._id ?? it.uuid ?? it.name).filter(Boolean);
    const isAllSelected = allIds.every(id => selectedIds.includes(id));
    setSelectedIds(isAllSelected ? [] : allIds);
  }, [items, selectedIds]);

  const beginCreate = () => {
    setCreating(true);
    setForm(emptyForm());
    setFormErrors({});
    setEditingId(null);
  };

  const beginEdit = (it) => {
    setCreating(false);
    setEditingId(it.id ?? it._id ?? it.uuid);
    setForm({
      name: it.name || '',
      description: it.description || '',
      tags: Array.isArray(it.tags) ? it.tags.join(', ') : (it.tags || ''),
    });
    setFormErrors({});
  };

  const cancelForm = () => {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormErrors({});
  };

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length) {
      toasts.error('Please fix validation errors to proceed.');
      return;
    }
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      tags: form.tags ? String(form.tags).split(',').map(s => s.trim()).filter(Boolean) : [],
    };

    try {
      if (creating) {
        // Optimistic: add temporary row
        const tempId = `tmp_${Date.now()}`;
        const optimistic = { id: tempId, ...payload, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), status: 'Draft' };
        setItems((prev) => [optimistic, ...prev]);

        const created = await createTestCase(payload);
        // Replace temp with created
        setItems((prev) => prev.map(it => (it.id === tempId ? created : it)));
        toasts.success('Test case created');
      } else if (editingId) {
        const id = editingId;
        // Optimistic: update locally
        setItems((prev) => prev.map(it => (String(it.id ?? it._id ?? it.uuid) === String(id) ? { ...it, ...payload } : it)));
        const updated = await updateTestCase(id, payload);
        // Sync with server response (in case server transforms fields)
        setItems((prev) => prev.map(it => (String(it.id ?? it._id ?? it.uuid) === String(id) ? updated : it)));
        toasts.success('Test case updated');
      }
      cancelForm();
    } catch (err) {
      toasts.error(err?.message || 'Operation failed');
      // On failure for create, remove optimistic temp (identified by tmp_)
      if (creating) {
        setItems((prev) => prev.filter(it => !(typeof it.id === 'string' && it.id.startsWith('tmp_'))));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (it) => {
    const id = it.id ?? it._id ?? it.uuid ?? it.name;
    if (!id) return;
    if (!window.confirm(`Delete test case "${it.name || id}"? This action cannot be undone.`)) return;

    setDeletingId(id);
    // Optimistic removal
    const prevItems = items;
    setItems((list) => list.filter(x => String(x.id ?? x._id ?? x.uuid ?? x.name) !== String(id)));
    try {
      await deleteTestCase(id);
      toasts.success('Test case deleted');
      setSelectedIds((sel) => sel.filter(x => String(x) !== String(id)));
    } catch (err) {
      toasts.error(err?.message || 'Delete failed, restoring list');
      setItems(prevItems); // rollback
    } finally {
      setDeletingId(null);
    }
  };

  const emptyState = (
    <div className="cn-card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 42, marginBottom: 8 }}>🧪</div>
      <h3>No test cases yet</h3>
      <p className="cn-muted">Create your first test to get started.</p>
      <div className="cn-actions" style={{ justifyContent: 'center' }}>
        <button className="cn-btn primary" onClick={beginCreate}>Create Test Case</button>
      </div>
    </div>
  );

  const headerActions = (
    <div className="cn-actions" style={{ marginBottom: 12 }}>
      <button className="cn-btn primary" onClick={beginCreate}>New Test</button>
      <button className="cn-btn" onClick={toggleSelectAll}>
        {items.length > 0 && selectedIds.length === items.length ? 'Unselect All' : 'Select All'}
      </button>
      <span className="cn-muted">{selectedCount} selected</span>
    </div>
  );

  const renderForm = (
    <form className="cn-form" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
      <label className="cn-field">
        <span>Test Name</span>
        <input
          type="text"
          placeholder="e.g., Checkout flow"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          aria-invalid={!!formErrors.name}
          aria-describedby="err-name"
        />
        {formErrors.name && <small id="err-name" className="cn-muted" style={{ color: 'var(--cn-error, #DC2626)' }}>{formErrors.name}</small>}
      </label>
      <label className="cn-field">
        <span>Description</span>
        <textarea
          rows="4"
          placeholder="Describe scenario and acceptance criteria..."
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          aria-invalid={!!formErrors.description}
          aria-describedby="err-desc"
        />
        {formErrors.description && <small id="err-desc" className="cn-muted" style={{ color: 'var(--cn-error, #DC2626)' }}>{formErrors.description}</small>}
      </label>
      <label className="cn-field">
        <span>Tags (comma separated)</span>
        <input
          type="text"
          placeholder="smoke, checkout"
          value={form.tags}
          onChange={(e) => handleChange('tags', e.target.value)}
        />
      </label>
      <div className="cn-actions">
        <button className="cn-btn primary" type="submit" disabled={submitting}>
          {creating ? (submitting ? 'Creating...' : 'Create') : (submitting ? 'Saving...' : 'Save')}
        </button>
        <button type="button" className="cn-btn ghost" onClick={cancelForm} disabled={submitting}>Cancel</button>
      </div>
    </form>
  );

  const rows = useMemo(() => {
    return items.map((it) => {
      const id = it.id ?? it._id ?? it.uuid ?? it.name;
      const status = it.status || it.state || 'Ready';
      const updated = it.updated_at || it.updatedAt || it.modified_at || it.modifiedAt || '';
      const checked = selectedIds.includes(id);
      return (
        <div className="cn-table-row" key={String(id)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={checked}
              aria-label={`Select ${it.name || id}`}
              onChange={() => toggleSelected(id)}
            />
            <div>
              <div style={{ fontWeight: 600 }}>{it.name || '(untitled)'}</div>
              <div className="cn-muted" style={{ fontSize: 12, marginTop: 2, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.description || ''}
              </div>
            </div>
          </div>
          <div>{updated ? new Date(updated).toLocaleString() : '-'}</div>
          <div>
            <span className={`cn-badge ${status === 'Ready' ? 'ok' : status.toLowerCase().includes('review') ? 'warn' : 'info'}`}>
              {status}
            </span>
          </div>
          <div>
            <div className="cn-actions">
              <button className="cn-btn small" onClick={() => beginEdit(it)}>Edit</button>
              <button className="cn-btn small ghost" onClick={() => handleDelete(it)} disabled={deletingId === id}>
                {deletingId === id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      );
    });
  }, [items, selectedIds, toggleSelected, deletingId]);

  return (
    <>
      <section className="cn-section">
        <div className="cn-section-header">
          <h2>Test Cases</h2>
          <p className="cn-muted">Create, update, and manage your automated tests. Selections persist for test runs.</p>
        </div>
        <div className="cn-section-body">
          {loading && (
            <div className="cn-card">
              <div className="cn-muted">Loading test cases...</div>
            </div>
          )}
          {error && (
            <div className="cn-card">
              <div className="cn-kpi error">Failed to load</div>
              <div className="cn-muted" style={{ marginTop: 8 }}>{error.message || 'Unknown error'}</div>
            </div>
          )}
          {!loading && !error && items.length === 0 && !creating && !editingId && emptyState}
          {(creating || editingId) && (
            <div className="cn-card">
              <h3>{creating ? 'Create Test Case' : 'Edit Test Case'}</h3>
              {renderForm}
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <>
              {headerActions}
              <div className="cn-table">
                <div className="cn-table-row cn-table-head">
                  <div>Name</div>
                  <div>Last Updated</div>
                  <div>Status</div>
                  <div>Actions</div>
                </div>
                {rows}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
