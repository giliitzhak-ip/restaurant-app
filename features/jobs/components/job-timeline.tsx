'use client';

import type { JobStatus } from '@/types/database';
import { Timeline, type TimelineEntry } from '@/components/ui/timeline';
import { TIMELINE_ORDER } from '@/lib/services/jobs/workflow';
import { useT } from '@/components/providers/i18n-provider';

interface Props {
  status: JobStatus;
  history: Array<{ id: string; to_status: JobStatus; created_at: string; note: string | null }>;
}

/**
 * Renders the full lifecycle, not just what has happened — the customer can see
 * what comes next. Cancelled and disputed jobs show the real history instead.
 */
export function JobTimeline({ status, history }: Props) {
  const t = useT();

  const reachedAt = new Map<JobStatus, string>();
  for (const entry of history) {
    if (!reachedAt.has(entry.to_status)) reachedAt.set(entry.to_status, entry.created_at);
  }

  if (status === 'cancelled' || status === 'disputed') {
    const entries: TimelineEntry[] = history.map((entry, index) => ({
      id: entry.id,
      label: t.job.statusLabel[entry.to_status],
      at: entry.created_at,
      note: entry.note,
      state: index === history.length - 1 ? 'current' : 'done',
    }));
    return <Timeline entries={entries} />;
  }

  const currentIndex = TIMELINE_ORDER.indexOf(status);

  const entries: TimelineEntry[] = TIMELINE_ORDER.map((step, index) => ({
    id: step,
    label: t.job.statusLabel[step],
    at: reachedAt.get(step) ?? null,
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));

  return <Timeline entries={entries} />;
}
