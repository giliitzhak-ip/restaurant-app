import { POISON_CENTER_NOTICE, POISON_CENTER_PHONE, SYNC_STATE_LABELS, type SyncState } from '@/schema/enums';
import type { ValidationProblem } from '@/schema/pestLog';
import { fieldDomId } from '@/schema/fieldRegistry';

/** דרישה 16 — מוצג באופן קבוע ובולט בכל מסך. */
export function PoisonNotice(): React.JSX.Element {
  return (
    <div className="poison-notice" role="note">
      במקרה של חשד להרעלה ניתן לפנות למרכז הארצי להרעלות:{' '}
      <a href={`tel:${POISON_CENTER_PHONE.replace('-', '')}`}>{POISON_CENTER_PHONE}</a>
      <span className="visually-hidden">{POISON_CENTER_NOTICE}</span>
    </div>
  );
}

export interface SyncBadgeProps {
  state: SyncState;
  pendingCount?: number;
  isOnline?: boolean;
}

/** מצב השמירה והסנכרון — מוצג תמיד. */
export function SyncBadge({ state, pendingCount = 0, isOnline = true }: SyncBadgeProps): React.JSX.Element {
  const label = SYNC_STATE_LABELS[state];
  const detail = state === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : '';
  return (
    <span className={`sync-badge state-${state}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      {label}
      {detail}
      {!isOnline ? <span className="visually-hidden"> — המכשיר אינו מחובר לרשת</span> : null}
    </span>
  );
}

export interface ProblemListProps {
  problems: ValidationProblem[];
  onNavigate: (problem: ValidationProblem) => void;
  title?: string;
}

/**
 * רשימת השדות החסרים בעברית.
 * לחיצה על שגיאה מעבירה לשלב הנכון וממקדת את השדה עצמו.
 */
export function ProblemList({ problems, onNavigate, title }: ProblemListProps): React.JSX.Element | null {
  if (problems.length === 0) return null;
  return (
    <div className="alert alert-error" role="alert" aria-live="assertive">
      <h3>{title ?? `לא ניתן להשלים את היומן — ${problems.length} שדות חסרים או שגויים`}</h3>
      <p className="small" style={{ margin: '0 0 0.3rem' }}>
        לחיצה על שורה תעביר ישירות לשדה.
      </p>
      <ul className="problem-list">
        {problems.map((problem) => (
          <li key={`${problem.path}-${problem.message}`}>
            <button type="button" className="problem-btn" onClick={() => onNavigate(problem)}>
              <span className="problem-step">
                שלב {problem.step}
                {problem.requirement > 0 ? ` · סעיף ${problem.requirement}` : ''}
                {problem.itemIndex ? ` · פריט ${problem.itemIndex}` : ''}
              </span>
              {problem.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ממקד שדה לפי נתיב, אחרי שהשלב הנכון נטען. */
export function focusField(path: string): void {
  const container = document.getElementById(fieldDomId(path));
  if (!container) return;
  container.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const focusable = container.querySelector<HTMLElement>(
    'input:not([type=hidden]), textarea, select, button, canvas, [tabindex]',
  );
  if (focusable) {
    focusable.focus({ preventScroll: true });
  } else {
    container.setAttribute('tabindex', '-1');
    container.focus({ preventScroll: true });
  }
}

export function Alert({
  kind,
  title,
  children,
}: {
  kind: 'error' | 'warning' | 'success' | 'info';
  title?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {title ? <h3>{title}</h3> : null}
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="empty-state">{children}</div>;
}
