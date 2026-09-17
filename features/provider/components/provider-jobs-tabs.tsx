'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { JobStatus, JobUrgency } from '@/types/database';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { JobCard } from '@/components/ui/job-card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';
import { ProviderJobFeed } from './job-feed';
import { useApi } from '@/hooks/use-api';
import { useT } from '@/components/providers/i18n-provider';

type Feed = 'available' | 'mine' | 'history';

interface JobRow {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: JobStatus;
  urgency: JobUrgency;
  address: string;
  created_at: string;
  category: { name: string; icon: string } | null;
}

function JobList({ feed }: { feed: 'mine' | 'history' }) {
  const t = useT();
  const { data, loading, error, reload } = useApi<{ jobs: JobRow[] }>(
    `/api/provider/jobs?feed=${feed}`,
    [feed],
  );

  if (loading && !data) return <SkeletonList rows={3} />;
  if (error) return <ErrorState description={error} onRetry={reload} />;

  const jobs = data?.jobs ?? [];
  if (jobs.length === 0) return <EmptyState title={t.empty.noJobs} />;

  return (
    <ul className="space-y-3">
      {jobs.map((job) => (
        <li key={job.id}>
          <JobCard
            href={`/provider/jobs/${job.id}`}
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
            }}
          />
        </li>
      ))}
    </ul>
  );
}

/** Tabbed job views for the provider: new leads, active work, history. */
export function ProviderJobsTabs({ providerId, verified }: { providerId: string; verified: boolean }) {
  const t = useT();
  const [feed, setFeed] = useState<Feed>(verified ? 'available' : 'mine');

  const tabs: Array<{ id: Feed; label: string }> = [
    { id: 'available', label: t.provider.newJobs },
    { id: 'mine', label: t.provider.myJobs },
    { id: 'history', label: t.customer.recentJobs },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t.nav.jobs} className="flex gap-1 rounded-lg bg-secondary p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={feed === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setFeed(tab.id)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              feed === tab.id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${feed}`} aria-labelledby={`tab-${feed}`}>
        {feed === 'available' ? (
          verified ? (
            <ProviderJobFeed providerId={providerId} />
          ) : (
            <EmptyState
              title={t.provider.pendingVerification}
              description={t.provider.pendingVerificationBody}
              action={
                <Button asChild size="sm" variant="accent">
                  <Link href="/provider/onboarding">{t.provider.completeOnboarding}</Link>
                </Button>
              }
            />
          )
        ) : (
          <JobList feed={feed} />
        )}
      </div>
    </div>
  );
}
