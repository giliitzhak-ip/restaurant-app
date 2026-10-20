import { prisma } from '@sahar/db';
import type { ProviderKey } from '@sahar/providers';
import { UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyList } from '@/components/empty-list';
import { PrivateImage } from '@/components/media/private-image';
import { PageHeader } from '@/components/page-header';
import { GenerationForm, type ProviderOption } from '@/components/studio/generation-form';
import { JobList } from '@/components/studio/job-list';
import { ProjectSelect } from '@/components/studio/studio-pickers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { formatTime } from '@/lib/format';
import { loadSceneForGeneration, planScene } from '@/lib/generation';
import { format, isolateLtr } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import { listJobs, toJobView } from '@/lib/jobs';
import { getStats } from '@/lib/studio-stats';
import { cn } from '@/lib/utils';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.studio.title };
}

type Search = { searchParams: Promise<{ project?: string; scene?: string }> };

export default async function StudioPage({ searchParams }: Search) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const s = t.studio;
  const query = await searchParams;

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id, deletedAt: null, masterAudio: { status: 'READY' } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true },
  });
  if (projects.length === 0) {
    return (
      <>
        <PageHeader title={s.title} description={s.description} />
        <EmptyList label={s.noProjects} />
      </>
    );
  }

  const project = projects.find((p) => p.id === query.project) ?? projects[0]!;
  const scenes = await prisma.scene.findMany({
    where: { projectId: project.id },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      startMs: true,
      endMs: true,
      status: true,
      _count: { select: { takes: true } },
    },
  });
  const sceneId = scenes.find((scene) => scene.id === query.scene)?.id ?? scenes[0]?.id;
  const scene = sceneId ? await loadSceneForGeneration(user.id, sceneId) : null;

  const providerNames: Record<string, string> = {
    mock: s.providers.mock.name,
    'local-gpu': s.providers.localGpu.name,
  };
  let options: ProviderOption[] = [];
  if (scene) {
    const describe = (key: ProviderKey, name: string, description: string): ProviderOption => {
      const plan = planScene(scene, key);
      const problem = plan.problem ? s.errors[plan.problem] : null;
      return {
        key,
        name,
        description,
        available: plan.problem !== 'notOperational',
        isTest: key === 'mock',
        estimate: plan.estimate,
        problem,
      };
    };
    options = [
      describe('mock', s.providers.mock.name, s.providers.mock.description),
      describe('local-gpu', s.providers.localGpu.name, s.providers.localGpu.description),
      // Paid providers are listed so the roadmap is visible, but cannot be chosen yet.
      {
        key: 'hedra',
        name: s.providers.hedra.name,
        description: s.providers.hedra.description,
        available: false,
        isTest: false,
        estimate: null,
        problem: null,
      },
      {
        key: 'fal',
        name: s.providers.fal.name,
        description: s.providers.fal.description,
        available: false,
        isTest: false,
        estimate: null,
        problem: null,
      },
    ];
  }

  const stats = await getStats(user.id);
  const usd = (value: number) => isolateLtr(`$${value.toFixed(2)}`);
  const budgetLine =
    stats.monthlyBudgetUsd === null
      ? s.estimate.budgetNotSet
      : format(s.estimate.budget, {
          budget: usd(stats.monthlyBudgetUsd),
          spent: usd(stats.spentThisMonthUsd),
        });
  const jobs = (await listJobs(user.id, { projectId: project.id })).map(toJobView);

  return (
    <>
      <PageHeader title={s.title} description={s.description} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-5 sm:pt-6">
              <ProjectSelect projects={projects} selectedId={project.id} label={s.chooseProject} />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{s.chooseScene}</span>
                {scenes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{s.noScenes}</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="studio-scenes">
                    {scenes.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/studio?project=${project.id}&scene=${item.id}`}
                          scroll={false}
                          aria-current={item.id === sceneId ? 'true' : undefined}
                          className={cn(
                            'flex min-h-14 flex-col justify-center rounded-lg border px-3 py-2 text-sm',
                            item.id === sceneId
                              ? 'text-gold-100 border-gold-400 bg-accent'
                              : 'border-border hover:border-gold-500/50',
                          )}
                          data-testid="studio-scene"
                        >
                          <span className="font-medium">
                            {format(t.timeline.sceneLabel, { n: item.position + 1 })}
                          </span>
                          <bdi className="text-xs text-muted-foreground tabular-nums">
                            {formatTime(item.startMs)}–{formatTime(item.endMs)}
                          </bdi>
                          {item._count.takes > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {format(t.scenes.takes, { count: item._count.takes })}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
          {scene ? (
            <Card>
              <CardHeader>
                <CardTitle>{s.sceneDetails}</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <div className="aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                  {scene.referenceImage?.asset.status === 'READY' ? (
                    <PrivateImage
                      assetId={scene.referenceImage.asset.id}
                      alt={scene.character?.name ?? ''}
                      className="size-full"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <UserRound className="size-8" aria-hidden />
                    </div>
                  )}
                </div>
                <dl className="flex min-w-0 flex-col gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t.scenes.character}</dt>
                    <dd className="font-medium">
                      {scene.character ? <bdi>{scene.character.name}</bdi> : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t.scenes.prompt}</dt>
                    <dd className="break-words">
                      {scene.prompt ? <bdi>{scene.prompt}</bdi> : '—'}
                    </dd>
                  </div>
                  <div>
                    <Badge variant="muted">{t.scenes.status[scene.status]}</Badge>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-3">
          {scene ? (
            <Card>
              <CardContent className="pt-5 sm:pt-6">
                <GenerationForm
                  key={scene.id}
                  sceneId={scene.id}
                  providers={options}
                  resolution={`${scene.project.outputWidth}×${scene.project.outputHeight}`}
                  budgetLine={budgetLine}
                  t={s}
                />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{s.jobs.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <JobList jobs={jobs} t={s} providerNames={providerNames} locale={locale} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
