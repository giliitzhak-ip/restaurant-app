import { CONSENT_STATEMENTS } from '@sahar/shared';
import { ArrowRight, Clapperboard, Film } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { AssetStatus } from '@/components/media/asset-status';
import { PageHeader } from '@/components/page-header';
import { ProjectSettingsForm } from '@/components/projects/project-settings-form';
import { SongUpload } from '@/components/projects/song-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { listCharacterOptions } from '@/lib/characters';
import { getServerEnv } from '@/lib/env';
import { formatBytes, formatTime } from '@/lib/format';
import { checkHealth } from '@/lib/health';
import { format, isolateLtr } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import { deleteProjectAction, updateProjectAction } from '@/lib/project-actions';
import { loadProject } from '@/lib/projects';

type Params = { params: Promise<{ projectId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const user = await requireUser();
  const project = await loadProject(user.id, (await params).projectId);
  return { title: project?.title };
}

export default async function ProjectPage({ params }: Params) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const project = await loadProject(user.id, (await params).projectId);
  if (!project) notFound();
  const [characters, health] = await Promise.all([listCharacterOptions(user.id), checkHealth()]);
  const p = t.projects.page;
  const consent = CONSENT_STATEMENTS.MUSIC;
  const maxMb = getServerEnv().MAX_AUDIO_UPLOAD_MB;
  const audio = project.masterAudio;
  const analysis = audio?.audioAnalysis ?? null;
  const ready = audio?.status === 'READY' && analysis !== null;
  const hasTakes = project.scenes.some((scene) => scene._count.takes > 0);
  const numbers = new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US');

  const tempoText = (() => {
    if (!analysis || analysis.tempoConfidence === null) return p.tempoNone;
    const confidence = Math.round(analysis.tempoConfidence * 100);
    if (analysis.tempoBpm === null) return format(p.tempoUnreliable, { confidence });
    return format(p.tempoValue, {
      bpm: isolateLtr(`${Math.round(analysis.tempoBpm)} BPM`),
      confidence,
    });
  })();

  return (
    <>
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {p.back}
      </Link>
      <PageHeader title={project.title} description={project.description || undefined} />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" data-testid="song-card">
          <CardHeader>
            <CardTitle>{p.song}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {audio ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <bdi className="min-w-0 truncate text-sm font-medium">
                    {audio.originalFilename}
                  </bdi>
                  <AssetStatus
                    assetId={audio.id}
                    initialStatus={audio.status}
                    failureReason={audio.failureReason}
                    t={t}
                    workerOnline={health.worker}
                  />
                </div>
                {audio.status === 'UPLOADED' || audio.status === 'VERIFYING' ? (
                  <p className="text-sm text-muted-foreground">{p.analyzing}</p>
                ) : null}
                {ready ? (
                  <>
                    <audio
                      controls
                      preload="metadata"
                      src={`/api/media/${audio.id}`}
                      className="w-full"
                      data-testid="song-player"
                    />
                    <dl
                      className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3"
                      data-testid="song-facts"
                    >
                      {[
                        [p.facts.duration, formatTime(analysis.durationMs), 'duration'],
                        [
                          p.facts.sampleRate,
                          `${numbers.format(analysis.sampleRate)} Hz`,
                          'sample-rate',
                        ],
                        [p.facts.channels, String(analysis.channels), 'channels'],
                        [p.facts.codec, analysis.codec.toUpperCase(), 'codec'],
                        [
                          p.facts.bitRate,
                          analysis.bitRate ? `${Math.round(analysis.bitRate / 1000)} kbps` : '—',
                          'bit-rate',
                        ],
                        [p.facts.size, formatBytes(Number(audio.sizeBytes)), 'size'],
                        [
                          p.facts.silences,
                          numbers.format((analysis.silenceRegions as unknown[]).length),
                          'silences',
                        ],
                      ].map(([label, value, key]) => (
                        <div key={key} className="flex flex-col gap-0.5">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-medium" data-testid={`fact-${key}`}>
                            <bdi>{value}</bdi>
                          </dd>
                        </div>
                      ))}
                      <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-3">
                        <dt className="text-muted-foreground">{p.facts.tempo}</dt>
                        <dd className="font-medium" data-testid="fact-tempo">
                          {tempoText}
                          {analysis.tempoAlternativeBpm ? (
                            <span className="ms-2 text-xs text-muted-foreground">
                              {format(p.tempoAlternative, {
                                bpm: isolateLtr(`${Math.round(analysis.tempoAlternativeBpm)} BPM`),
                              })}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : null}
                {!hasTakes ? (
                  <details className="rounded-lg border border-border p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      {p.replaceSong}
                    </summary>
                    <p className="my-3 text-xs text-warning">{p.replaceWarning}</p>
                    <SongUpload
                      projectId={project.id}
                      t={t}
                      maxMb={maxMb}
                      consentText={consent[locale]}
                      consentVersion={consent.version}
                      label={p.replaceSong}
                      hint={format(t.projects.form.songHint, { max: maxMb })}
                    />
                  </details>
                ) : null}
              </div>
            ) : (
              <SongUpload
                projectId={project.id}
                t={t}
                maxMb={maxMb}
                consentText={consent[locale]}
                consentVersion={consent.version}
                label={p.uploadSong}
                hint={format(t.projects.form.songHint, { max: maxMb })}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{p.scenes}</CardTitle>
            <CardDescription data-testid="scenes-summary">
              {format(p.scenesSummary, { count: project.scenes.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {ready ? (
              <Button asChild>
                <Link href={`/projects/${project.id}/timeline`}>
                  <Film aria-hidden />
                  {p.openTimeline}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <Film aria-hidden />
                {p.openTimeline}
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/projects/${project.id}/scenes`}>
                <Clapperboard aria-hidden />
                {p.openScenes}
              </Link>
            </Button>
            {!ready ? <p className="text-xs text-muted-foreground">{t.timeline.notReady}</p> : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{p.settings}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectSettingsForm
              action={updateProjectAction.bind(null, project.id)}
              t={t.projects}
              common={t.common}
              characters={characters.map((c) => ({
                id: c.id,
                name: c.name,
                hasReference: c.referenceImages.length > 0,
              }))}
              initial={{
                title: project.title,
                description: project.description,
                aspectRatio: project.aspectRatio,
                mainCharacterId: project.mainCharacterId,
              }}
            />
          </CardContent>
        </Card>
      </div>

      <form action={deleteProjectAction.bind(null, project.id)} className="mt-8">
        <ConfirmSubmit
          variant="outline"
          message={p.deleteConfirm}
          className="text-destructive"
          data-testid="delete-project"
        >
          {p.delete}
        </ConfirmSubmit>
      </form>
    </>
  );
}
