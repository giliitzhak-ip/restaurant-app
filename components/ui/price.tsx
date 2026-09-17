import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/format';

interface PriceProps {
  amount: number | null | undefined;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  precise?: boolean;
}

const SIZE = { sm: 'text-sm', md: 'text-base font-semibold', lg: 'text-2xl font-bold' } as const;

/** Currency stays LTR inside RTL copy. */
export function Price({ amount, className, size = 'md', precise = false }: PriceProps) {
  return <span className={cn('num', SIZE[size], className)}>{formatPrice(amount, precise)}</span>;
}

interface PriceBreakdownProps {
  rows: Array<{ label: string; amount: number; muted?: boolean; negative?: boolean }>;
  total: { label: string; amount: number };
  note?: string;
  className?: string;
}

/**
 * The transparency panel required before any commitment: the customer sees the
 * job price and total; the provider sees gross, commission and net.
 */
export function PriceBreakdown({ rows, total, note, className }: PriceBreakdownProps) {
  return (
    <div className={cn('rounded-xl border bg-card p-4', className)}>
      <dl className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <dt className={row.muted ? 'text-muted-foreground' : ''}>{row.label}</dt>
            <dd className={cn('num font-medium', row.negative && 'text-destructive')}>
              {row.negative ? '−' : ''}
              {formatPrice(Math.abs(row.amount), true)}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-t pt-2 text-base font-bold">
          <dt>{total.label}</dt>
          <dd className="num">{formatPrice(total.amount, true)}</dd>
        </div>
      </dl>
      {note ? <p className="mt-3 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
