import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * UI primitives.
 *
 * Written in the shadcn/ui idiom — composable, class-variant based, no
 * runtime theming layer — rather than pulled in via the shadcn CLI, which
 * needs interactive scaffolding. See docs/DECISIONS.md D-006.
 *
 * Everything here obeys spec §38 and §41: large touch targets, visible
 * focus, real semantics, no glassmorphism or gradient noise.
 */

/* ────────────────────────────────── Button ────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'md' | 'lg' | 'xl';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-500 text-navy-950 hover:bg-accent-400 active:bg-accent-600 font-bold shadow-lg shadow-accent-500/20',
  secondary:
    'bg-navy-800 text-white hover:bg-navy-700 border border-navy-600',
  ghost: 'bg-transparent text-white hover:bg-navy-800',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 font-semibold',
  success:
    'bg-success-500 text-navy-950 hover:bg-success-400 font-bold shadow-lg shadow-success-500/20',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // Never below 44px tall: this is used one-handed, often while driving
  // between jobs (spec §19, §42).
  md: 'min-h-11 px-4 text-base rounded-xl',
  lg: 'min-h-14 px-6 text-lg rounded-2xl',
  xl: 'min-h-16 px-8 text-xl rounded-2xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading && <Spinner className="size-5" />}
      {children}
    </button>
  );
}

/* ────────────────────────────────── Card ──────────────────────────────── */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-2xl border border-navy-700 bg-navy-900 p-5 shadow-xl shadow-black/20',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────── Badge ─────────────────────────────── */

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-navy-800 text-slate-300 border-navy-600',
  accent: 'bg-accent-500/15 text-accent-400 border-accent-500/40',
  success: 'bg-success-500/15 text-success-400 border-success-500/40',
  warning: 'bg-warning-500/15 text-warning-400 border-warning-500/40',
  danger: 'bg-danger-500/15 text-danger-400 border-danger-500/40',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ───────────────────────────────── Spinner ────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─────────────────────────────── Text input ───────────────────────────── */

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, error, children, htmlFor }: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-200">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-slate-400">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-400">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClasses =
  'w-full rounded-xl border border-navy-600 bg-navy-950 px-4 py-3 text-base text-white ' +
  'placeholder:text-slate-500 focus:border-accent-500 focus:outline-none';

/* ──────────────────────────────── States ─────────────────────────────── */

/** Every critical flow needs all of these (spec §43). */
export function LoadingState({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-slate-300" role="status">
      <Spinner className="size-8 text-accent-400" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  title = 'משהו נכשל',
  message,
  onRetry,
  retryLabel = 'נסו שוב',
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Card className="border-danger-500/40 bg-danger-500/5 text-center">
      <h2 className="text-lg font-bold text-danger-400">{title}</h2>
      <p className="mt-2 text-slate-300">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="md" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 text-center">
      <h2 className="text-lg font-bold text-slate-200">{title}</h2>
      {message && <p className="mt-2 text-slate-400">{message}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ─────────────────────────── Number formatting ───────────────────────── */

/**
 * Prices, distances and durations stay LTR-readable inside RTL text
 * (spec §40). `.ltr-nums` isolates the run so "₪290" never renders as
 * "290₪" or gets reordered by the bidi algorithm.
 */
export function Money({ agorot, shekels }: { agorot?: number; shekels?: number }) {
  const value = agorot !== undefined ? agorot / 100 : (shekels ?? 0);
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(2);
  return (
    <span className="ltr-nums" dir="ltr">
      ₪{formatted}
    </span>
  );
}

export function Minutes({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">לא ידוע</span>;
  return (
    <span className="ltr-nums" dir="ltr">
      {Math.round(value)}
    </span>
  );
}

export function Distance({ km }: { km: number | null }) {
  if (km === null) return <span className="text-slate-400">—</span>;
  return (
    <span className="ltr-nums" dir="ltr">
      {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
    </span>
  );
}

export function Rating({ value, count }: { value: number | null; count?: number }) {
  if (value === null) {
    return <span className="text-sm text-slate-400">מקצוען חדש</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span aria-hidden="true" className="text-warning-400">
        ★
      </span>
      <span className="ltr-nums font-semibold" dir="ltr">
        {value.toFixed(1)}
      </span>
      {count !== undefined && count > 0 && (
        <span className="ltr-nums text-slate-400" dir="ltr">
          ({count})
        </span>
      )}
      <span className="sr-only">
        דירוג {value.toFixed(1)} מתוך 5{count ? `, ${count} ביקורות` : ''}
      </span>
    </span>
  );
}

/* ──────────────────────── Connection indicator ───────────────────────── */

export function ConnectionBanner({ state }: { state: 'connecting' | 'open' | 'reconnecting' | 'offline' }) {
  if (state === 'open') return null;

  // `open` is excluded by the early return above.
  const copy: Record<Exclude<typeof state, 'open'>, { text: string; tone: BadgeTone }> = {
    connecting: { text: 'מתחבר…', tone: 'neutral' },
    reconnecting: { text: 'החיבור אבד — מתחבר מחדש ומרענן', tone: 'warning' },
    offline: { text: 'אין חיבור. המידע עשוי להיות לא מעודכן.', tone: 'danger' },
  };

  const { text, tone } = copy[state];
  return (
    <div role="status" aria-live="polite" className="mb-3 flex justify-center">
      <Badge tone={tone}>{text}</Badge>
    </div>
  );
}
