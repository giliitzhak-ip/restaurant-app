import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { PhaseNotice } from '@/components/phase-notice';
import { JobList } from '@/components/studio/job-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';
import { listJobs, toJobView } from '@/lib/jobs';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.renders.title };
}

export default async function RendersPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const jobs = (await listJobs(user.id, {}, 50)).map(toJobView);
  const providerNames = {
    mock: t.studio.providers.mock.name,
    'local-gpu': t.studio.providers.localGpu.name,
  };

  return (
    <>
      <PageHeader title={t.pages.renders.title} description={t.pages.renders.description} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.studio.jobs.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <JobList
              jobs={jobs}
              t={t.studio}
              providerNames={providerNames}
              showProject
              locale={locale}
            />
          </CardContent>
        </Card>
        <PhaseNotice t={t} phase={5} features={t.pages.renders.features} />
      </div>
    </>
  );
}
