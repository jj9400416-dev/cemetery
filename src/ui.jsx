import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const toast = useCallback(
    (message) => push(message, 'info'),
    [push]
  );
  toast.success = (message) => push(message, 'success');
  toast.error = (message) => push(message, 'error');

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

export function PageHero({ eyebrow, title, subtitle }) {
  return (
    <div className="page-hero">
      <div className="container">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

export function SectionHead({ kicker, title, text }) {
  return (
    <div className="section-head">
      {kicker && <div className="kicker">{kicker}</div>}
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

export function EmptyState({ icon = '🕊️', title, hint }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
      {hint && <p style={{ margin: 0 }}>{hint}</p>}
    </div>
  );
}
