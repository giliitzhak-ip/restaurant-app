import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      // User text follows its own direction; email/password/number inputs pass dir="ltr".
      dir="auto"
      data-slot="input"
      className={cn(
        // 16px text on mobile prevents iOS Safari from zooming into focused inputs.
        'flex h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2 text-base text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:h-10 sm:text-sm',
        className,
      )}
      {...props}
    />
  );
}
