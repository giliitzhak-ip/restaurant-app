import type { TimeRange } from '@sahar/media';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { TimelineEditor } from '@/components/timeline/timeline-editor';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';
import { loadProject } from '@/lib/projects';

type Params = { params: Promise<{ projectId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.timeline.title };
}

export default async function ProjectTimelinePage({ params }: Params) {
  const user = await requireUser();
  const { t } = await getI18n();
  const project = await loadProject(user.id, (await params).projectId);
  if (!project) notFound();
  const audio = project.masterAudio;
  const analysis = audio?.audioAnalysis;

  return (
    <>
      <Link
        href={`/projects/${project.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        <bdi>{project.title}</bdi>
      </Link>
      <PageHeader
        title={
          <>
            {t.timeline.title} · <bdi>{project.title}</bdi>
          </>
        }
      />
      {audio?.status === 'READY' && analysis ? (
        <TimelineEditor
          projectId={project.id}
          audioAssetId={audio.id}
          waveformAssetId={analysis.waveformAssetId}
          durationMs={analysis.durationMs}
          silences={analysis.silenceRegions as unknown as TimeRange[]}
          beats={analysis.tempoBpm !== null ? (analysis.beatTimesMs as number[] | null) : null}
          initialScenes={project.scenes.map((scene) => ({
            id: scene.id,
            startMs: scene.startMs,
            endMs: scene.endMs,
            locked: scene._count.takes > 0,
          }))}
          t={t.timeline}
        />
      ) : (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground sm:pt-6">
            {t.timeline.notReady}
          </CardContent>
        </Card>
      )}
    </>
  );
}
