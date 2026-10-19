'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { format, type Dictionary } from '@/lib/i18n/config';

type Status = keyof Dictionary['media']['status'];

/** Maps the worker's technical failure reasons to user-facing text. */
export function describeFailure(
  t: Pick<Dictionary, 'media'>,
  reason: string | null | undefined,
): string {
  const r = t.media.reasons;
  if (!reason) return r.unsupported;
  if (reason.includes('image is too small')) return r.imageTooSmall;
  if (reason.includes('image is too large')) return r.imageTooLarge;
  if (reason.includes('audio is too short')) return r.audioTooShort;
  if (reason.includes('audio is too long')) return r.audioTooLong;
  if (reason.includes('contains video')) return r.containsVideo;
  if (reason.includes('after retries')) return r.retries;
  if (reason.includes('interrupted')) return r.interrupted;
  return r.unsupported;
}
const IN_PROGRESS: Status[] = ['PENDING_UPLOAD', 'UPLOADED', 'VERIFYING'];

/**
 * Shows an asset's real processing status. While the worker is busy it polls the status
 * endpoint and refreshes the page once the asset becomes READY or FAILED.
 */
export function AssetStatus({
  assetId,
  initialStatus,
  failureReason,
  t,
  workerOnline,
}: {
  assetId: string;
  initialStatus: Status;
  failureReason?: string | null;
  t: Pick<Dictionary, 'media'>;
  workerOnline?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [reason, setReason] = useState(failureReason ?? null);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (!IN_PROGRESS.includes(status)) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/assets/${assetId}`, { cache: 'no-store' });
        if (!response.ok) return;
        const body = (await response.json()) as { status: Status; failureReason: string | null };
        if (cancelled) return;
        if (body.status !== status) {
          setStatus(body.status);
          setReason(body.failureReason);
          if (!IN_PROGRESS.includes(body.status)) router.refresh();
        }
      } catch {
        /* transient network error: try again on the next tick */
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [assetId, status, router]);

  const busy = IN_PROGRESS.includes(status);
  return (
    <div className="flex flex-col gap-1" data-testid="asset-status" data-status={status}>
      <Badge variant={status === 'READY' ? 'success' : status === 'FAILED' ? 'danger' : 'default'}>
        {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
        {t.media.status[status]}
      </Badge>
      {status === 'FAILED' ? (
        <span className="text-xs text-destructive" data-testid="asset-failure">
          {format(t.media.failedReason, { reason: describeFailure(t, reason) })}
        </span>
      ) : null}
      {busy && workerOnline === false ? (
        <span className="text-xs text-warning">{t.media.workerOffline}</span>
      ) : null}
    </div>
  );
}
