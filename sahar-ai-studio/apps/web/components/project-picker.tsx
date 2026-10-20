import { prisma } from '@sahar/db';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { EmptyList } from '@/components/empty-list';
import { formatTime } from '@/lib/format';

/** Lists the user's projects with a ready song, linking to a per-project editor. */
export async function ProjectPicker({
  ownerId,
  suffix,
  intro,
  empty,
}: {
  ownerId: string;
  suffix: 'timeline' | 'scenes';
  intro: string;
  empty: string;
}) {
  const projects = await prisma.project.findMany({
    where: { ownerId, deletedAt: null, masterAudio: { status: 'READY' } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      masterAudio: { select: { durationMs: true } },
      _count: { select: { scenes: true } },
    },
  });
  if (projects.length === 0) return <EmptyList label={empty} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{intro}</p>
      <ul className="flex flex-col gap-2" data-testid="project-picker">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              href={`/projects/${project.id}/${suffix}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 hover:border-gold-500/50"
            >
              <bdi className="font-medium">{project.title}</bdi>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <bdi>
                  {project.masterAudio?.durationMs
                    ? formatTime(project.masterAudio.durationMs, { tenths: false })
                    : ''}
                </bdi>
                <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
