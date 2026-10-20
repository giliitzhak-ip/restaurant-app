'use client';

import { Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cancelGenerationAction } from '@/lib/generation-actions';
import { format, isolateLtr, type Dictionary } from '@/lib/i18n/config';
import type { JobView } from '@/lib/jobs';
import { TakePlayer } from './take-player';

const ACTIVE = new Set(['QUEUED', 'SUBMITTING', 'PROCESSING']);
type Status = keyof Dictionary['studio']['jobs']['status'];

const badgeVariant = (status: string) =>
  status === 'COMPLETED'
    ? 'success'
    : status === 'FAILED'
      ? 'danger'
      : status === 'CANCELLED'
        ? 'muted'
        : 'default';

/**
 * Generation jobs with live status. While any job is active the list polls the status
 * endpoint (1.5 s) and shows the real progress stored by the worker; when a job ends,
 * the page is refreshed so the new take appears.
 */
export function JobList({
  jobs,
  t,
  providerNames,
  showProject,
  locale,
}: {
  jobs: JobView[];
  t: Dictionary['studio'];
  providerNames: Record<string, string>;
  showProject?: boolean;
  locale: string;
}) {
  const router = useRouter();
  const [live, setLive] = useState<
    Record<string, { status: string; progress: number | null; errorCode: string | null }>
  >({});
  const [cancelling, startCancel] = useTransition();
  const [error, setError] = useState<string>();
  const activeIds = jobs
    .filter((job) => ACTIVE.has(live[job.id]?.status ?? job.status))
    .map((job) => job.id);
  const activeKey = activeIds.join(',');

  useEffect(() => {
    setLive({});
  }, [jobs]);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/generations?ids=${activeKey}`, { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const rows = (await response.json()) as {
          id: string;
          status: string;
          progress: number | null;
          errorCode: string | null;
        }[];
        // Decide from the fetched rows, not inside the state updater (React runs that later).
        const finished = rows.some((row) => !ACTIVE.has(row.status));
        setLive((previous) => ({
          ...previous,
          ...Object.fromEntries(rows.map((row) => [row.id, row])),
        }));
        if (finished) router.refresh();
      } catch {
        /* transient network error: retry on next tick */
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeKey, router]);

  const dateFormat = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">{t.jobs.empty}</p>;
  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="flex flex-col gap-3" data-testid="job-list">
        {jobs.map((job) => {
          const state = live[job.id] ?? job;
          const status = state.status as Status;
          const percent = state.progress !== null ? Math.round(state.progress * 100) : null;
          const errorText =
            status === 'FAILED'
              ? (t.jobs.errors[(state.errorCode ?? 'generic') as keyof typeof t.jobs.errors] ??
                t.jobs.errors.generic)
              : null;
          return (
            <li
              key={job.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
              data-testid="job-row"
              data-status={status}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {showProject ? (
                      <>
                        <bdi>{job.projectTitle}</bdi> ·{' '}
                      </>
                    ) : null}
                    {format(t.jobs.scene, { n: job.scenePosition + 1 })}
                    {job.takeNumber ? ` · ${format(t.jobs.take, { n: job.takeNumber })}` : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {providerNames[job.providerKey] ?? job.providerKey} ·{' '}
                    <bdi>{dateFormat.format(new Date(job.createdAt))}</bdi>
                    {job.costUsd !== null
                      ? ` · ${format(t.jobs.cost, { amount: isolateLtr(`$${job.costUsd}`) })}`
                      : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={badgeVariant(status)} data-testid="job-status">
                    {ACTIVE.has(status) ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : null}
                    {t.jobs.status[status]}
                    {status === 'PROCESSING' && percent !== null ? (
                      <bdi> {format(t.jobs.progress, { percent })}</bdi>
                    ) : null}
                  </Badge>
                  {ACTIVE.has(status) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={cancelling}
                      onClick={() => {
                        if (!window.confirm(t.jobs.cancelConfirm)) return;
                        startCancel(async () => {
                          const result = await cancelGenerationAction(job.id);
                          if (result.error) setError(result.error);
                          router.refresh();
                        });
                      }}
                      data-testid="job-cancel"
                    >
                      <X aria-hidden />
                      {t.jobs.cancel}
                    </Button>
                  ) : null}
                </div>
              </div>
              {status === 'PROCESSING' ? (
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent ?? 0}
                  data-testid="job-progress"
                >
                  <div
                    className="h-full bg-gold-400 transition-[width] duration-500"
                    style={{ width: `${percent ?? 0}%` }}
                  />
                </div>
              ) : null}
              {errorText ? (
                <p className="text-sm text-destructive" data-testid="job-error">
                  {errorText}
                </p>
              ) : null}
              {status === 'COMPLETED' && job.videoAssetId ? (
                <TakePlayer
                  assetId={job.videoAssetId}
                  isTestRender={job.isTestRender}
                  testBadge={t.testBadge}
                  downloadLabel={t.jobs.download}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
