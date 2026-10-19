import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full rounded-md border border-input bg-surface px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/70 focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50 sm:text-sm',
        className,
      )}
      {...props}
    />
  );
}
