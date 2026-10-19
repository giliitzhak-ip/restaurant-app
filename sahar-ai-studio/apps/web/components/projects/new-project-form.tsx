'use client';

import { Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { FormError } from '@/components/auth/form-message';
import { uploadErrorMessage } from '@/components/media/file-upload';
import { Button } from '@/components/ui/button';
import { format, type Dictionary } from '@/lib/i18n/config';
import { createProjectAction } from '@/lib/project-actions';
import { uploadFile } from '@/lib/upload-client';
import { ProjectFields, type CharacterChoice } from './project-fields';

/**
 * Creates the project (server action), then streams the song with real upload progress,
 * then opens the project page where the analysis status is shown.
 */
export function NewProjectForm({
  t,
  characters,
  maxMb,
  consentText,
  consentVersion,
}: {
  t: Pick<Dictionary, 'projects' | 'upload' | 'common'>;
  characters: CharacterChoice[];
  maxMb: number;
  consentText: string;
  consentVersion: string;
}) {
  const router = useRouter();
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<'idle' | 'creating' | 'uploading'>('idle');
  const [progress, setProgress] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    if (!file) return setError(t.upload.errors.noFile);
    if (!consent) return setError(t.upload.errors.consentRequired);
    if (file.size > maxMb * 1024 * 1024)
      return setError(uploadErrorMessage(t, 'tooLarge', maxMb, 'MP3/WAV'));

    setPhase('creating');
    const created = await createProjectAction({}, new FormData(event.currentTarget));
    if (!created.ok || !created.projectId) {
      setPhase('idle');
      return setError(created.error ?? t.common.unexpectedError);
    }
    setPhase('uploading');
    const outcome = await uploadFile(
      `/api/uploads?target=project-audio&projectId=${encodeURIComponent(created.projectId)}`,
      file,
      consentVersion,
      setProgress,
    );
    if (!outcome.ok) {
      // The project exists; the song can be uploaded again from its page.
      setPhase('idle');
      setCreatedId(created.projectId);
      setError(
        format(t.projects.form.createdUploadFailed, {
          error: uploadErrorMessage(t, outcome.error ?? 'generic', maxMb, 'MP3/WAV'),
        }),
      );
      return;
    }
    router.push(`/projects/${created.projectId}`);
  }

  const busy = phase !== 'idle';
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5"
      noValidate
      data-testid="new-project-form"
    >
      <ProjectFields t={t.projects} characters={characters} />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t.projects.form.song}</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label
            htmlFor={fileId}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-surface px-4 text-sm font-medium hover:border-gold-500/60 hover:bg-accent"
          >
            <Upload className="size-4" aria-hidden />
            {t.upload.chooseFile}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
            className="sr-only"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            data-testid="song-input"
          />
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {file ? <bdi>{file.name}</bdi> : t.upload.noFile}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {format(t.projects.form.songHint, { max: maxMb })}
        </p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={busy}
          className="mt-1 size-5 shrink-0 accent-[var(--color-gold-400)]"
          data-testid="song-consent"
        />
        <span>{consentText}</span>
      </label>
      <FormError message={error} />
      {createdId ? (
        <Link
          href={`/projects/${createdId}`}
          className="text-sm font-medium text-gold-300 hover:underline"
        >
          {t.common.open}
        </Link>
      ) : null}
      {phase === 'uploading' ? (
        <div className="flex flex-col gap-1" role="status" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gold-400 transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {format(t.upload.uploading, { percent: Math.round(progress * 100) })}
          </span>
        </div>
      ) : null}
      <div>
        <Button
          type="submit"
          size="lg"
          disabled={busy || createdId !== null}
          data-testid="create-project"
        >
          {busy ? t.projects.form.creating : t.projects.form.create}
        </Button>
      </div>
    </form>
  );
}
