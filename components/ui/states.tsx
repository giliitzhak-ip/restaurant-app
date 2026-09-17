import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon ?? <Inbox className="size-6" aria-hidden />}
      </span>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = 'טוען…', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground', className)}
    >
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'משהו השתבש. נסה שוב.',
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertCircle className="size-8 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden />
          נסה שוב
        </Button>
      ) : null}
    </div>
  );
}

export function SuccessState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-success/30 bg-success/5 px-6 py-10 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
        <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden>
          <path
            d="m5 13 4 4L19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
