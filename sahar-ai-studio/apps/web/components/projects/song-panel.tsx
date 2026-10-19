'use client';

import { useRouter } from 'next/navigation';
import { FileUpload } from '@/components/media/file-upload';
import type { Dictionary } from '@/lib/i18n/config';

/** Upload (or replace) the project's song; shows real processing status while analyzing. */
export function SongUpload({
  projectId,
  t,
  maxMb,
  consentText,
  consentVersion,
  label,
  hint,
}: {
  projectId: string;
  t: Pick<Dictionary, 'upload'>;
  maxMb: number;
  consentText: string;
  consentVersion: string;
  label: string;
  hint: string;
}) {
  const router = useRouter();
  return (
    <FileUpload
      url={`/api/uploads?target=project-audio&projectId=${encodeURIComponent(projectId)}`}
      accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
      typesLabel="MP3/WAV"
      maxMb={maxMb}
      consentText={consentText}
      consentVersion={consentVersion}
      buttonLabel={label}
      hint={hint}
      t={t}
      onUploaded={() => router.refresh()}
      testId="song-upload"
    />
  );
}
