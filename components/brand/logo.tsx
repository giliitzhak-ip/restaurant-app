import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'ink' | 'light';
  href?: string | null;
  withTagline?: boolean;
  className?: string;
}

const SIZE = {
  sm: 'text-base tracking-[0.18em]',
  md: 'text-xl tracking-[0.2em]',
  lg: 'text-3xl tracking-[0.22em]',
  xl: 'text-4xl sm:text-5xl tracking-[0.22em]',
} as const;

const TAGLINE_SIZE = {
  sm: 'text-[10px]',
  md: 'text-[11px]',
  lg: 'text-xs',
  xl: 'text-sm',
} as const;

/**
 * Typographic wordmark — no image asset. "GET" carries the weight, "SERVICE"
 * is set lighter in the accent colour, and the whole mark stays LTR even in an
 * RTL page so the brand always reads the same way.
 */
export function Logo({ size = 'md', tone = 'ink', href = '/', withTagline = false, className }: LogoProps) {
  const mark = (
    <span className={cn('flex flex-col', className)} dir="ltr">
      <span className={cn('font-black leading-none', SIZE[size])}>
        <span className={tone === 'light' ? 'text-white' : 'text-foreground'}>GET</span>
        <span className="text-accent">SERVICE</span>
      </span>
      {withTagline ? (
        <span
          className={cn(
            'mt-1 font-medium',
            TAGLINE_SIZE[size],
            tone === 'light' ? 'text-white/70' : 'text-muted-foreground',
          )}
          dir="rtl"
        >
          המקצוען הנכון. בדיוק כשצריך.
        </span>
      ) : null}
    </span>
  );

  if (!href) return mark;

  return (
    <Link href={href} aria-label="GET SERVICE — דף הבית" className="inline-flex">
      {mark}
    </Link>
  );
}
