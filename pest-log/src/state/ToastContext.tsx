import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * הודעות קצרות על פעולות שקרו בפועל.
 * אין להציג toast שאינו מחובר לפעולה אמיתית.
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
  action?: ToastAction | undefined;
}

interface ToastContextValue {
  toasts: Toast[];
  /** מציג הודעה. שגיאה נשארת עד סגירה ידנית או עד 8 שניות. */
  showToast: (message: string, kind?: Toast['kind'], action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: Toast['kind'] = 'info', action?: ToastAction) => {
      const id = nextId;
      nextId += 1;
      setToasts((current) => [...current, { id, message, kind, ...(action ? { action } : {}) }]);
      const lifetime = kind === 'error' ? 8000 : 2600;
      globalThis.setTimeout(() => dismiss(id), lifetime);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, showToast, dismiss }), [toasts, showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast${toast.kind === 'error' ? ' is-error' : toast.kind === 'success' ? ' is-success' : ''}`}
          >
            <span>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast חייב להיות בתוך ToastProvider');
  return context;
}
