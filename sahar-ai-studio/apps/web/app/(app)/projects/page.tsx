import { prisma } from '@sahar/db';
import type { Metadata } from 'next';
import { EmptyList } from '@/components/empty-list';
import { PageHeader } from '@/components/page-header';
import { PhaseNotice } from '@/components/phase-notice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.projects.title };
}

export default async function ProjectsPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const page = t.pages.projects;
  const projects = await prisma.project.findMany({
    where: { ownerId: user.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true },
  });
  const dateFormat = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    dateStyle: 'medium',
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
            {projects.length === 0 ? (
              <EmptyList label={t.common.empty} />
            ) : (
              <ul className="divide-y divide-border">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="font-medium">{project.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {dateFormat.format(project.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <PhaseNotice t={t} phase={2} features={page.features} />
      </div>
    </>
  );
}
