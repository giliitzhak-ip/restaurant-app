'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Component language (spec §63).
 *
 * Compact, precise, restrained. Border, fill, radius and shadow are spent by
 * ROLE, not stamped on every block — one radius and one shadow everywhere
 * flattens hierarchy (spec §41 of the design brief, §39 of the product spec).
 */

/* ────────────────────────────────── Button ────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'success';
type ButtonSize = 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-[#081019] hover:bg-brand-bright active:bg-brand font-bold shadow-lg shadow-brand/20',
  secondary:
    'bg-surface-3 text-ink hover:bg-line-strong border border-line-strong font-semibold',
  quiet: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-bad text-white hover:bg-bad-bright font-semibold',
  success: 'bg-ok text-[#04140a] hover:bg-ok-bright font-bold shadow-lg shadow-ok/20',
};

const SIZES: Record<ButtonSize, string> = {
  // Never under 44px: this is operated one-handed, often mid-drive (§46).
  md: 'min-h-11 px-4 text-[15px] rounded-xl',
  lg: 'min-h-13 px-5 text-base rounded-2xl',
  xl: 'min-h-15 px-6 text-lg rounded-2xl',
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
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading && <Spinner className="size-[18px]" />}
      {children}
    </button>
  );
}

/* ─────────────────────────────── Containers ───────────────────────────── */

/**
 * A card says "separate object". Not everything is one: plain sections get
 * spacing and type, and only genuinely distinct objects get a surface (§39).
 */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('rounded-2xl border border-line bg-surface-1 p-4', className)}
    >
      {children}
    </div>
  );
}

/** A recessed area inside a card — for figures and grouped values. */
export function Inset({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('rounded-xl bg-surface-2 p-3', className)}>
      {children}
    </div>
  );
}

/** A section heading that is a label, not a card. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 text-[12.5px] font-semibold tracking-wide text-ink-3">{children}</h2>
  );
}

/* ──────────────────────────────── Badge ───────────────────────────────── */

type Tone = 'neutral' | 'brand' | 'live' | 'ok' | 'warn' | 'bad';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2 border-line-strong',
  brand: 'bg-brand/12 text-brand-bright border-brand/35',
  live: 'bg-live/12 text-live border-live/35',
  ok: 'bg-ok/12 text-ok-bright border-ok/35',
  warn: 'bg-warn/12 text-warn-bright border-warn/35',
  bad: 'bg-bad/12 text-bad-bright border-bad/35',
};

/** Only for meaningful state — never decoration (§63). */
export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────── Spinner ──────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ──────────────────────────────── Fields ──────────────────────────────── */

export const inputClasses =
  'w-full rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-base text-ink ' +
  'placeholder:text-ink-3 focus:border-brand focus:outline-none';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[13px] text-ink-3">{hint}</p>}
      {error && (
        <p role="alert" className="text-[13px] font-medium text-bad-bright">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A segmented choice. The customer's timing lives here: three options, one
 * tap, no calendar until one is actually needed (spec §5, §6).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 transition-colors',
              selected
                ? 'border-brand bg-brand/12 text-ink'
                : 'border-line-strong bg-surface-2 text-ink-2 hover:border-brand/50 hover:text-ink',
            )}
          >
            <span className="text-[15px] font-semibold">{option.label}</span>
            {option.hint && <span className="text-[11px] text-ink-3">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The one control that matters most on the provider's screen (spec §9, §45).
 *
 * A switch, not a pair of buttons: the provider needs to see the current
 * answer from across a van, and change it with a thumb. The label is part of
 * the control so the whole row is the hit target.
 */
export function Switch({
  checked,
  onChange,
  label,
  detail,
  busy = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  detail?: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-start transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'border-ok/45 bg-ok/10'
          : 'border-line-strong bg-surface-2 hover:border-line-strong',
      )}
    >
      <span className="min-w-0">
        <span className={cn('block text-lg font-bold', checked ? 'text-ok-bright' : 'text-ink')}>
          {label}
        </span>
        {detail && <span className="mt-0.5 block text-sm text-ink-2">{detail}</span>}
      </span>

      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-ok' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute inline-flex size-6 items-center justify-center rounded-full bg-white transition-all',
            // RTL: "on" moves the knob to the start edge, which in Hebrew is
            // the right — so it is positioned by logical inset, not by left.
            checked ? 'end-1' : 'start-1',
          )}
        >
          {busy && <Spinner className="size-3.5 text-ink-3" />}
        </span>
      </span>
    </button>
  );
}

/* ──────────────────────────────── States ──────────────────────────────── */

export function LoadingState({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-ink-2" role="status">
      <Spinner className="size-7 text-brand-bright" />
      <p className="text-sm">{label}</p>
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
    <Card className="border-bad/35 bg-bad/5 text-center">
      <h2 className="text-base font-bold text-bad-bright">{title}</h2>
      <p className="mt-2 text-sm text-ink-2">{message}</p>
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
    <div className="py-10 text-center">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {message && <p className="mx-auto mt-2 max-w-[34ch] text-sm text-ink-2">{message}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ──────────────────────── Numbers, kept LTR (§40) ─────────────────────── */

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
  if (value === null) return <span className="text-ink-3">—</span>;
  return (
    <span className="ltr-nums" dir="ltr">
      {Math.round(value)}
    </span>
  );
}

export function Distance({ km }: { km: number | null }) {
  if (km === null) return <span className="text-ink-3">—</span>;
  return (
    <span className="ltr-nums" dir="ltr">
      {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
    </span>
  );
}

/**
 * Rating. A provider with no reviews shows "חדש ב-GET SERVICE" rather than
 * 0.0 stars, because a zero is a claim and an absence is not (spec §27).
 */
export function Rating({
  value,
  count,
  size = 'sm',
}: {
  value: number | null;
  count?: number;
  size?: 'sm' | 'lg';
}) {
  if (value === null || count === 0) {
    return <span className={cn('text-ink-3', size === 'lg' ? 'text-sm' : 'text-[13px]')}>חדש ב-GET SERVICE</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1', size === 'lg' ? 'text-base' : 'text-[13px]')}>
      <span aria-hidden="true" className="text-warn-bright">
        ★
      </span>
      <span className="ltr-nums font-bold" dir="ltr">
        {value.toFixed(1)}
      </span>
      {count !== undefined && count > 0 && (
        <span className="ltr-nums text-ink-3" dir="ltr">
          ({count > 999 ? `${(count / 1000).toFixed(1)}k` : count})
        </span>
      )}
      <span className="sr-only">
        דירוג {value.toFixed(1)} מתוך 5{count ? `, ${count} ביקורות` : ''}
      </span>
    </span>
  );
}

/**
 * Avatar. Initials on a stable surface — never a fabricated photograph
 * (spec §20). The tint is derived from the name so a provider looks the same
 * everywhere without storing anything.
 */
export function Avatar({
  name,
  initials,
  size = 44,
}: {
  name: string;
  initials?: string;
  size?: number;
}) {
  const letters =
    initials ??
    name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('');
  const hue = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line-strong font-bold text-ink"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(145deg, hsl(${hue} 32% 22%), hsl(${hue} 28% 14%))`,
      }}
    >
      {letters}
    </span>
  );
}

/**
 * The visual signature: ● ───────→ ●
 *
 * A connection being made, provider to customer. Used at the matching and
 * tracking moments only (spec §40).
 */
export function ConnectionLine({
  active = true,
  label,
}: {
  active?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className="relative flex size-2.5 shrink-0">
        {active && <span className="gs-pulse absolute inline-flex size-2.5 rounded-full bg-live" />}
        <span className="relative inline-flex size-2.5 rounded-full bg-live" />
      </span>
      <span className="relative h-px flex-1 overflow-hidden bg-line-strong">
        {active && (
          <span
            className="gs-travel absolute inset-y-0 w-10 bg-gradient-to-l from-transparent via-live to-transparent"
            style={{ ['--gs-travel-distance' as string]: '100%' }}
          />
        )}
      </span>
      {label && <span className="shrink-0 text-[11px] text-ink-3">{label}</span>}
      <span className="size-2.5 shrink-0 rounded-full border border-brand-bright bg-surface-2" />
    </div>
  );
}

/* ──────────────────────── Connection indicator ───────────────────────── */

export function ConnectionBanner({
  state,
}: {
  state: 'connecting' | 'open' | 'reconnecting' | 'offline';
}) {
  if (state === 'open') return null;

  const copy: Record<Exclude<typeof state, 'open'>, { text: string; tone: Tone }> = {
    connecting: { text: 'מתחבר…', tone: 'neutral' },
    reconnecting: { text: 'החיבור אבד — מתחבר מחדש ומרענן', tone: 'warn' },
    offline: { text: 'אין חיבור. המידע עשוי להיות לא מעודכן.', tone: 'bad' },
  };

  const { text, tone } = copy[state];
  return (
    <div role="status" aria-live="polite" className="mb-3 flex justify-center">
      <Badge tone={tone}>{text}</Badge>
    </div>
  );
}

/* ───────────────────────────── Bottom sheet ──────────────────────────── */

/**
 * A bottom sheet preserves context (spec §44, §47): opening a provider
 * profile must not lose the match behind it, and closing must return to
 * exactly that match.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="סגירה"
        onClick={onClose}
        className="absolute inset-0 bg-black/65"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-surface-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="inline-flex size-11 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
