import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import './ToastContext.css';

const ToastContext = createContext({
  showToast: () => {},
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast = {
      id,
      message,
      type: options.type || 'success',
      duration: Number(options.duration || 3600),
    };
    setToasts((current) => [...current.slice(-3), toast]);
    window.setTimeout(() => removeToast(id), toast.duration);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div className={`app-toast ${toast.type}`} key={toast.id}>
            <span className="app-toast-accent" aria-hidden="true" />
            <span className="app-toast-icon" aria-hidden="true">
              {toast.type === 'error' ? '!' : '✓'}
            </span>
            <p>{toast.message}</p>
            <button type="button" onClick={() => removeToast(toast.id)} aria-label="Dismiss notification">
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
