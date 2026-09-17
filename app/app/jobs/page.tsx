import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobCard, type JobCardData } from '@/components/ui/job-card';
import { EmptyState } from '@/components/ui/states';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { ACTIVE_STATUSES } from '@/lib/services/jobs/workflow';

export const metadata: Metadata = { title: 'העבודות שלי' };

interface JobRow {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: JobCardData['status'];
  urgency: JobCardData['urgency'];
  address: string;
  created_at: string;
  budget_min: number | null;
  budget_max: number | null;
  category: { name: string; icon: string } | null;
  job_offers: { id: string }[] | null;
}

export default async function CustomerJobsPage() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  const supabase = await getServerSupabase();

  let jobs: JobRow[] = [];
  if (supabase && session) {
    const { data } = await supabase
      .from('jobs')
      .select(
        `id, reference, title, description, status, urgency, address, created_at,
         budget_min, budget_max,
         category:categories (name, icon),
         job_offers (id)`,
      )
      .eq('customer_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    jobs = (data ?? []) as unknown as JobRow[];
  }

  const active = jobs.filter((job) => ACTIVE_STATUSES.includes(job.status));
  const past = jobs.filter((job) => !ACTIVE_STATUSES.includes(job.status));

  const render = (list: JobRow[]) => (
    <ul className="space-y-3">
      {list.map((job) => (
        <li key={job.id}>
          <JobCard
            href={`/app/jobs/${job.id}`}
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
              offersCount: job.job_offers?.length ?? 0,
            }}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t.nav.jobs}</h1>
        <Button asChild size="sm" variant="accent">
          <Link href="/app/new">
            <Plus aria-hidden />
            {t.customer.newJob}
          </Link>
        </Button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title={t.empty.noJobs}
          description="כל בקשה שתפתח תופיע כאן עם כל ההיסטוריה שלה."
          action={
            <Button asChild size="sm" variant="accent">
              <Link href="/app/new">{t.customer.newJob}</Link>
            </Button>
          }
        />
      ) : (
        <>
          {active.length > 0 ? (
            <section aria-labelledby="active">
              <h2 id="active" className="mb-3 text-sm font-semibold text-muted-foreground">
                {t.customer.activeJobs}
              </h2>
              {render(active)}
            </section>
          ) : null}

          {past.length > 0 ? (
            <section aria-labelledby="past">
              <h2 id="past" className="mb-3 text-sm font-semibold text-muted-foreground">
                {t.customer.recentJobs}
              </h2>
              {render(past)}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
