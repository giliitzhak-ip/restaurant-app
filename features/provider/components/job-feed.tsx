'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Radar, ThumbsDown } from 'lucide-react';
import type { JobStatus, JobUrgency } from '@/types/database';
import { Button } from '@/components/ui/button';
import { JobCard } from '@/components/ui/job-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';
import { OfferDialog } from './offer-dialog';
import { useApi } from '@/hooks/use-api';
import { useRealtime } from '@/hooks/use-realtime';
import { useT } from '@/components/providers/i18n-provider';
import { postJson } from '@/features/auth/lib/form';

interface Assignment {
  id: string;
  match_score: number;
  distance_km: number | null;
  hasOffer: boolean;
  job: {
    id: string;
    reference: string;
    title: string;
    description: string;
    status: JobStatus;
    urgency: JobUrgency;
    address: string;
    created_at: string;
    budget_min: number | null;
    budget_max: number | null;
    category: { name: string; icon: string } | null;
    job_images: Array<{ id: string }> | null;
  } | null;
}

/**
 * The provider's lead feed: jobs the match engine broadcast to them.
 *
 * New broadcasts arrive over Realtime on `job_assignments` — the same table RLS
 * uses to grant access, so a row appearing here is by definition one they may
 * act on.
 */
export function ProviderJobFeed({ providerId }: { providerId: string }) {
  const t = useT();
  const { data, loading, error, reload } = useApi<{ assignments: Assignment[] }>(
    '/api/provider/jobs?feed=available',
  );

  const [offerJobId, setOfferJobId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  useRealtime<Record<string, unknown>>({
    table: 'job_assignments',
    filter: `provider_id=eq.${providerId}`,
    event: 'INSERT',
    onChange: reload,
  });

  const decline = useCallback(
    async (jobId: string) => {
      setDecliningId(jobId);
      try {
        await postJson(`/api/jobs/${jobId}/decline`, {});
        await reload();
      } finally {
        setDecliningId(null);
      }
    },
    [reload],
  );

  const assignments = (data?.assignments ?? []).filter((entry) => entry.job);

  if (loading && !data) return <SkeletonList rows={3} />;
  if (error) return <ErrorState description={error} onRetry={reload} />;

  if (assignments.length === 0) {
    return (
      <EmptyState
        title="אין עבודות חדשות כרגע"
        description="הדלק ״אני זמין״ ונשלח לך עבודות רלוונטיות באזור שלך."
        icon={<Radar className="size-6" aria-hidden />}
      />
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {assignments.map((assignment) => {
          const job = assignment.job!;
          return (
            <li key={assignment.id}>
              <JobCard
                job={{
                  id: job.id,
                  reference: job.reference,
                  title: job.title,
                  description: job.description,
                  status: job.status,
                  urgency: job.urgency,
                  categoryName: job.category?.name ?? '',
                  categoryIcon: job.category?.icon ?? 'wrench',
                  address: job.address,
                  createdAt: job.created_at,
                  budgetMin: job.budget_min,
                  budgetMax: job.budget_max,
                  distanceKm: assignment.distance_km === null ? null : Number(assignment.distance_km),
                  imageCount: job.job_images?.length ?? 0,
                }}
                action={
                  <>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/provider/jobs/${job.id}`}>{t.common.details}</Link>
                    </Button>
                    {assignment.hasOffer ? (
                      <Badge variant="accent">{t.offer.sent}</Badge>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={decliningId === job.id}
                          onClick={() => decline(job.id)}
                        >
                          <ThumbsDown aria-hidden />
                          {t.provider.notInterested}
                        </Button>
                        <Button variant="success" size="sm" onClick={() => setOfferJobId(job.id)}>
                          {t.provider.interested}
                        </Button>
                      </>
                    )}
                  </>
                }
              />
            </li>
          );
        })}
      </ul>

      {offerJobId ? (
        <OfferDialog
          jobId={offerJobId}
          open
          onClose={() => setOfferJobId(null)}
          onDone={() => {
            setOfferJobId(null);
            void reload();
          }}
        />
      ) : null}
    </>
  );
}
