'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingProps {
  value: number;
  count?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showValue?: boolean;
}

const SIZE_CLASS = { sm: 'size-3.5', md: 'size-4', lg: 'size-6' } as const;

/** Read-only star display. */
export function Rating({ value, count, size = 'md', className, showValue = true }: RatingProps) {
  const rounded = Math.round(value * 2) / 2;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              SIZE_CLASS[size],
              star <= rounded
                ? 'fill-warning text-warning'
                : star - 0.5 === rounded
                  ? 'fill-warning/50 text-warning'
                  : 'text-muted-foreground/40',
            )}
          />
        ))}
      </span>
      {showValue ? (
        <span className="text-sm font-medium">
          <span className="num">{value ? value.toFixed(1) : '—'}</span>
          {count !== undefined && count !== null ? (
            <span className="text-muted-foreground"> ({count})</span>
          ) : null}
        </span>
      ) : null}
      <span className="sr-only">
        דירוג {value ? value.toFixed(1) : 'אין'} מתוך 5
        {count ? `, ${count} ביקורות` : ''}
      </span>
    </span>
  );
}

interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
}

/** Keyboard-accessible star picker (arrow keys change the value). */
export function RatingInput({ value, onChange, label, size = 'lg', id }: RatingInputProps) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-row-reverse items-center gap-1"
    >
      {[5, 4, 3, 2, 1].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} כוכבים`}
          onClick={() => onChange(star)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              event.preventDefault();
              onChange(Math.min(5, (value || 0) + 1));
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              event.preventDefault();
              onChange(Math.max(1, (value || 1) - 1));
            }
          }}
          className="rounded p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              SIZE_CLASS[size],
              star <= value ? 'fill-warning text-warning' : 'text-muted-foreground/40',
            )}
          />
        </button>
      ))}
    </div>
  );
}
