import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { JobCard, type JobCardData } from '@/components/ui/job-card';
import { EmptyState } from '@/components/ui/states';
import { CategoryGrid } from '@/features/customer/components/category-grid';
import { getCategories, getServices } from '@/lib/services/catalogue';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { ACTIVE_STATUSES } from '@/lib/services/jobs/workflow';

export const metadata: Metadata = { title: 'בית' };

interface ActiveJobRow {
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

export default async function CustomerHome() {
  const [{ t }, session, categories, services] = await Promise.all([
    getServerDictionary(),
    getSessionContext(),
    getCategories(),
    getServices(),
  ]);

  const supabase = await getServerSupabase();
  let activeJobs: ActiveJobRow[] = [];

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
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(5);

    activeJobs = (data ?? []) as unknown as ActiveJobRow[];
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5">
        <h1 className="text-2xl font-bold">{t.customer.greeting}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.customer.greetingSub}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="accent">
            <Link href="/app/new">
              <Plus aria-hidden />
              {t.customer.newJob}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/search">
              <Search aria-hidden />
              {t.search.title}
            </Link>
          </Button>
        </div>
      </section>

      {activeJobs.length > 0 ? (
        <section aria-labelledby="active-jobs">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="active-jobs" className="text-lg font-semibold">
              {t.customer.activeJobs}
            </h2>
            <Button asChild variant="link" size="sm">
              <Link href="/app/jobs">{t.common.viewAll}</Link>
            </Button>
          </div>
          <ul className="space-y-3">
            {activeJobs.map((job) => (
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
        </section>
      ) : (
        <EmptyState
          title={t.empty.noJobs}
          description="פתח בקשה ראשונה ונמצא לך בעל מקצוע זמין בסביבה."
          action={
            <Button asChild variant="accent" size="sm">
              <Link href="/app/new">{t.customer.newJob}</Link>
            </Button>
          }
        />
      )}

      <section aria-labelledby="categories">
        <h2 id="categories" className="mb-3 text-lg font-semibold">
          {t.customer.allCategories}
        </h2>
        <CategoryGrid categories={categories} services={services} />
      </section>
    </div>
  );
}
