import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Lightweight Toast/Notification system for success/error/info messages.
 * Exposes a provider and hook:
 * - ToastProvider: wrap it high in the tree
 * - useToasts: { show, success, error, info }
 */

// PUBLIC_INTERFACE
export const ToastContext = createContext(null);

/**
 * Generate unique, short IDs for toasts.
 */
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// PUBLIC_INTERFACE
export function useToasts() {
  /** Access toast API: show({type, title, message, duration}), success(msg), error(msg), info(msg) */
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToasts must be used within <ToastProvider>');
  }
  return ctx;
}

// PUBLIC_INTERFACE
export function ToastProvider({ children }) {
  /** Provider that manages toasts and renders them */
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    setToasts((items) => items.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(({ type = 'info', title, message, duration = 3500 } = {}) => {
    const id = uid();
    setToasts((items) => [...items, { id, type, title, message }]);
    const t = setTimeout(() => remove(id), duration);
    timers.current.set(id, t);
    return id;
  }, [remove]);

  const success = useCallback((message, title = 'Success') => show({ type: 'success', title, message }), [show]);
  const error = useCallback((message, title = 'Error') => show({ type: 'error', title, message, duration: 6000 }), [show]);
  const info = useCallback((message, title = 'Info') => show({ type: 'info', title, message }), [show]);

  useEffect(() => () => {
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
  }, []);

  const value = useMemo(() => ({ show, success, error, info, remove }), [show, success, error, info, remove]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" role="region" style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 50,
        display: 'grid',
        gap: 10,
      }}>
        {toasts.map(t => (
          <div key={t.id} className="cn-card" style={{
            minWidth: 260,
            maxWidth: 420,
            borderLeft: `4px solid ${t.type === 'success' ? 'var(--cn-success, #059669)'
              : t.type === 'error' ? 'var(--cn-error, #DC2626)'
              : 'var(--cn-primary, #1E3A8A)'}`,
            boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {t.type === 'success' ? '✅ ' : t.type === 'error' ? '⚠️ ' : 'ℹ️ '}
              {t.title || (t.type === 'success' ? 'Success' : t.type === 'error' ? 'Error' : 'Info')}
            </div>
            {t.message && <div className="cn-muted">{t.message}</div>}
            <div className="cn-actions" style={{ marginTop: 8 }}>
              <button className="cn-btn small ghost" onClick={() => remove(t.id)}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
