import { prisma } from '@sahar/db';
import type { Metadata } from 'next';
import { EmptyList } from '@/components/empty-list';
import { PageHeader } from '@/components/page-header';
import { PhaseNotice } from '@/components/phase-notice';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.renders.title };
}

export default async function RendersPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const page = t.pages.renders;
  const jobs = await prisma.renderJob.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, status: true, progress: true, project: { select: { title: true } } },
  });

  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{page.listTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <EmptyList label={t.common.empty} />
            ) : (
              <ul className="divide-y divide-border">
                {jobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="font-medium">{job.project.title}</span>
                    <span className="flex items-center gap-2">
                      {job.progress !== null ? (
                        <bdi className="text-sm text-muted-foreground">
                          {Math.round(job.progress * 100)}%
                        </bdi>
                      ) : null}
                      <Badge variant="muted">{job.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <PhaseNotice t={t} phase={5} features={page.features} />
      </div>
    </>
  );
}
