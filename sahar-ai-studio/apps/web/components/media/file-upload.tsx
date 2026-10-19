'use client';

import { Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { FormError } from '@/components/auth/form-message';
import { Button } from '@/components/ui/button';
import { format, type Dictionary } from '@/lib/i18n/config';
import { uploadFile, type UploadErrorCode } from '@/lib/upload-client';

export interface FileUploadProps {
  url: string;
  accept: string;
  /** e.g. "MP3/WAV" — used in the unsupported-type message. */
  typesLabel: string;
  maxMb: number;
  consentText: string;
  consentVersion: string;
  buttonLabel: string;
  hint?: string;
  t: Pick<Dictionary, 'upload'>;
  onUploaded: (assetId: string) => void;
  testId?: string;
}

export function uploadErrorMessage(
  t: Pick<Dictionary, 'upload'>,
  code: UploadErrorCode,
  maxMb: number,
  types: string,
) {
  return format(t.upload.errors[code], { max: maxMb, types });
}

/** File picker + rights confirmation + upload with real byte progress. */
export function FileUpload({
  url,
  accept,
  typesLabel,
  maxMb,
  consentText,
  consentVersion,
  buttonLabel,
  hint,
  t,
  onUploaded,
  testId,
}: FileUploadProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    setError(undefined);
    if (!file) return setError(t.upload.errors.noFile);
    if (!consent) return setError(t.upload.errors.consentRequired);
    if (file.size > maxMb * 1024 * 1024)
      return setError(uploadErrorMessage(t, 'tooLarge', maxMb, typesLabel));
    setProgress(0);
    const outcome = await uploadFile(url, file, consentVersion, setProgress);
    setProgress(null);
    if (!outcome.ok || !outcome.assetId) {
      setError(uploadErrorMessage(t, outcome.error ?? 'generic', maxMb, typesLabel));
      return;
    }
    setFile(null);
    setConsent(false);
    if (inputRef.current) inputRef.current.value = '';
    onUploaded(outcome.assetId);
  }

  const busy = progress !== null;
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label
          htmlFor={id}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-surface px-4 text-sm font-medium hover:border-gold-500/60 hover:bg-accent"
        >
          <Upload className="size-4" aria-hidden />
          {t.upload.chooseFile}
        </label>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          data-testid={testId ? `${testId}-input` : undefined}
        />
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {file ? <bdi>{file.name}</bdi> : t.upload.noFile}
        </span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={busy}
          className="mt-1 size-5 shrink-0 accent-[var(--color-gold-400)]"
          data-testid={testId ? `${testId}-consent` : undefined}
        />
        <span>{consentText}</span>
      </label>
      <FormError message={error} />
      {busy ? (
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
      ) : (
        <div>
          <Button
            type="button"
            onClick={submit}
            data-testid={testId ? `${testId}-submit` : undefined}
          >
            {buttonLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
