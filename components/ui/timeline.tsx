import { Check, Circle, Dot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/format';

export interface TimelineEntry {
  id: string;
  label: string;
  at?: string | null;
  note?: string | null;
  state: 'done' | 'current' | 'upcoming';
}

/** Vertical job timeline. Uses an ordered list so the sequence is announced. */
export function Timeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  return (
    <ol className={cn('relative space-y-0', className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        return (
          <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast ? (
              <span
                className={cn(
                  'absolute top-7 h-[calc(100%-1.75rem)] w-px bg-border',
                  'start-[0.6875rem]',
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                entry.state === 'done' && 'border-success bg-success text-success-foreground',
                entry.state === 'current' && 'border-accent bg-accent/10 text-accent',
                entry.state === 'upcoming' && 'border-border bg-background text-muted-foreground',
              )}
              aria-hidden
            >
              {entry.state === 'done' ? (
                <Check className="size-3.5" />
              ) : entry.state === 'current' ? (
                <Circle className="size-2.5 fill-current" />
              ) : (
                <Dot className="size-3" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  'text-sm font-medium',
                  entry.state === 'upcoming' && 'text-muted-foreground',
                )}
              >
                {entry.label}
                {entry.state === 'current' ? <span className="sr-only"> (הסטטוס הנוכחי)</span> : null}
              </p>
              {entry.at ? (
                <p className="text-xs text-muted-foreground">{formatRelative(entry.at)}</p>
              ) : null}
              {entry.note ? <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
