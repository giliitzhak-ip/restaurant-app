import { ArrowRight, Film } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyList } from '@/components/empty-list';
import { PageHeader } from '@/components/page-header';
import { ApplyMainCharacter } from '@/components/scenes/apply-main';
import { SceneCard } from '@/components/scenes/scene-card';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';
import { listCharacterOptions } from '@/lib/characters';
import { getI18n } from '@/lib/i18n/server';
import { loadProject } from '@/lib/projects';
import { applyMainCharacterAction, updateSceneAction } from '@/lib/scene-actions';

type Params = { params: Promise<{ projectId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.scenes.title };
}

export default async function ProjectScenesPage({ params }: Params) {
  const user = await requireUser();
  const { t } = await getI18n();
  const project = await loadProject(user.id, (await params).projectId);
  if (!project) notFound();
  const characters = await listCharacterOptions(user.id);
  const main = characters.find((c) => c.id === project.mainCharacterId);
  const identity = {
    characterId: main?.id ?? null,
    referenceImageId: main?.referenceImages.find((r) => r.isPrimary)?.id ?? null,
  };
  const options = characters.map((c) => ({
    id: c.id,
    name: c.name,
    references: c.referenceImages.map((r) => ({
      id: r.id,
      assetId: r.assetId,
      isPrimary: r.isPrimary,
    })),
  }));

  return (
    <>
      <Link
        href={`/projects/${project.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {project.title}
      </Link>
      <PageHeader
        title={`${t.scenes.title} · ${project.title}`}
        actions={
          project.masterAudio?.status === 'READY' ? (
            <Button asChild variant="outline">
              <Link href={`/projects/${project.id}/timeline`}>
                <Film aria-hidden />
                {t.projects.page.openTimeline}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {project.scenes.length === 0 ? (
        <EmptyList label={t.scenes.none} />
      ) : (
        <div className="flex flex-col gap-4">
          {main ? (
            <ApplyMainCharacter
              action={applyMainCharacterAction.bind(null, project.id)}
              label={t.scenes.applyMain}
              done={t.scenes.applyMainDone}
            />
          ) : null}
          <ul className="flex flex-col gap-3" data-testid="scene-list">
            {project.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={{
                  id: scene.id,
                  position: scene.position,
                  startMs: scene.startMs,
                  endMs: scene.endMs,
                  status: scene.status,
                  takes: scene._count.takes,
                  characterId: scene.characterId,
                  referenceImageId: scene.referenceImageId,
                  prompt: scene.prompt,
                }}
                characters={options}
                identity={identity}
                action={updateSceneAction.bind(null, scene.id)}
                t={t.scenes}
                common={t.common}
                sceneLabel={t.timeline.sceneLabel}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
