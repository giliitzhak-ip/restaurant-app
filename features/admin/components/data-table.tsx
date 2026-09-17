'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
}

/**
 * Admin table. A real <table> with a caption and scoped headers, so it stays
 * navigable with a screen reader, and scrolls horizontally on narrow viewports
 * rather than collapsing into unreadable cards.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = 'לא נמצאו רשומות',
}: Props<T>) {
  if (loading && rows.length === 0) return <SkeletonList rows={5} />;
  if (error) return <ErrorState description={error} onRetry={onRetry} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b bg-secondary/50">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('p-3 text-start text-xs font-semibold text-muted-foreground', column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b last:border-0 hover:bg-secondary/30">
              {columns.map((column) => (
                <td key={column.key} className={cn('p-3 align-middle', column.className)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
