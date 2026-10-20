import { prisma } from '@sahar/db';
import { Music2, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyList } from '@/components/empty-list';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';
import { formatTime } from '@/lib/format';
import { format } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.projects.title };
}

export default async function ProjectsPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const projects = await prisma.project.findMany({
    where: { ownerId: user.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      aspectRatio: true,
      updatedAt: true,
      masterAudio: { select: { status: true, durationMs: true } },
      mainCharacter: { select: { name: true } },
      _count: { select: { scenes: true } },
    },
  });
  const dateFormat = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    dateStyle: 'medium',
  });

  return (
    <>
      <PageHeader
        title={t.projects.title}
        description={t.projects.description}
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus aria-hidden />
              {t.projects.newButton}
            </Link>
          </Button>
        }
      />
      {projects.length === 0 ? (
        <EmptyList label={t.projects.empty} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold-500/50"
                data-testid="project-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <bdi className="font-semibold">{project.title}</bdi>
                  <Badge variant="muted">{t.projects.aspect[project.aspectRatio]}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Music2 className="size-4" aria-hidden />
                    {project.masterAudio?.status === 'READY' && project.masterAudio.durationMs ? (
                      <bdi>{formatTime(project.masterAudio.durationMs, { tenths: false })}</bdi>
                    ) : project.masterAudio ? (
                      t.media.status[project.masterAudio.status]
                    ) : (
                      t.projects.noSong
                    )}
                  </span>
                  <span>{format(t.projects.scenesCount, { count: project._count.scenes })}</span>
                  {project.mainCharacter ? <span>{project.mainCharacter.name}</span> : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {dateFormat.format(project.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
