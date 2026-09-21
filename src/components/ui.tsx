import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Field({
  label, hint, error, children, htmlFor,
}: {
  label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}

export function ChipGroup<T extends string>({
  label, options, value, onChange, multiple = false, hint,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T[] | T;
  onChange: (next: T[]) => void;
  multiple?: boolean;
  hint?: string;
}) {
  const selected = Array.isArray(value) ? value : [value];
  const groupId = useId();
  return (
    <div className="field" role="group" aria-labelledby={groupId}>
      <span className="field-label" id={groupId}>{label}</span>
      <div className="chips">
        {options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className="chip"
              aria-pressed={on}
              onClick={() => {
                if (!multiple) return onChange([opt.value]);
                onChange(on ? selected.filter((v) => v !== opt.value) : [...selected, opt.value]);
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Tag({ kind, children }: { kind: 'warn' | 'error' | 'ok' | 'muted'; children: ReactNode }) {
  return <span className={`tag tag-${kind}`}>{children}</span>;
}

export function Notice({
  kind = 'info', title, children,
}: { kind?: 'info' | 'warn' | 'error'; title?: string; children: ReactNode }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <span aria-hidden="true">{kind === 'error' ? '⛔' : kind === 'warn' ? '⚠️' : 'ℹ️'}</span>
      <div>
        {title && <div className="bold">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, action }: { icon: string; title: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big" aria-hidden="true">{icon}</div>
      <p>{title}</p>
      {action}
    </div>
  );
}

export function Dialog({
  open, title, onClose, children, footer,
}: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="spread mb-3">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>סגור</button>
        </div>
        {children}
        {footer && <div className="row mt-4">{footer}</div>}
      </div>
    </div>
  );
}

export function SaveIndicator({ state, pending, online }: { state: string; pending: number; online: boolean }) {
  const cls = !online ? 'offline' : state === 'saving' ? 'saving' : '';
  const text = !online
    ? `לא מחובר · ${pending} ממתינים לסנכרון`
    : state === 'saving'
      ? 'שומר…'
      : pending > 0 ? `נשמר · ${pending} ממתינים לסנכרון` : 'נשמר';
  return (
    <span className="save-pill" aria-live="polite">
      <span className={`save-dot ${cls}`} aria-hidden="true" />
      {text}
    </span>
  );
}
