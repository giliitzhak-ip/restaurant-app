'use client';

import { Star } from 'lucide-react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { FormError } from '@/components/auth/form-message';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { AssetStatus } from '@/components/media/asset-status';
import { FileUpload } from '@/components/media/file-upload';
import { PrivateImage } from '@/components/media/private-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { deleteReferenceAction, setPrimaryReferenceAction } from '@/lib/character-actions';
import { format, type Dictionary } from '@/lib/i18n/config';

export interface ReferenceItem {
  id: string;
  assetId: string;
  isPrimary: boolean;
  status: keyof Dictionary['media']['status'];
  failureReason: string | null;
  width: number | null;
  height: number | null;
}

export function ReferenceGallery({
  characterId,
  characterName,
  items,
  t,
  maxMb,
  consentText,
  consentVersion,
  workerOnline,
}: {
  characterId: string;
  characterName: string;
  items: ReferenceItem[];
  t: Pick<Dictionary, 'characters' | 'media' | 'upload'>;
  maxMb: number;
  consentText: string;
  consentVersion: string;
  workerOnline: boolean;
}) {
  const router = useRouter();
  const [deleteState, deleteAction] = useActionState(deleteReferenceAction, {});
  const r = t.characters.references;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{r.help}</p>
      <p className="rounded-md border border-gold-500/30 bg-accent/60 p-3 text-xs leading-relaxed text-gold-200">
        {r.identityNote}
      </p>
      <FormError message={deleteState.error} />
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{r.empty}</p> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="reference-gallery">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
            data-testid="reference-item"
            data-primary={item.isPrimary}
          >
            <div className="relative aspect-[4/5] bg-muted">
              {item.status === 'READY' ? (
                <PrivateImage
                  assetId={item.assetId}
                  alt={format(r.altText, { name: characterName })}
                  className="size-full"
                />
              ) : (
                <div className="flex size-full items-center justify-center p-2">
                  <AssetStatus
                    assetId={item.assetId}
                    initialStatus={item.status}
                    failureReason={item.failureReason}
                    t={t}
                    workerOnline={workerOnline}
                  />
                </div>
              )}
              {item.isPrimary && item.status === 'READY' ? (
                <Badge className="absolute start-2 top-2">
                  <Star className="size-3" aria-hidden />
                  {r.primary}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1 p-2">
              {!item.isPrimary && item.status === 'READY' ? (
                <form action={setPrimaryReferenceAction}>
                  <input type="hidden" name="referenceId" value={item.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    {r.setPrimary}
                  </Button>
                </form>
              ) : null}
              <form action={deleteAction}>
                <input type="hidden" name="referenceId" value={item.id} />
                <ConfirmSubmit
                  variant="ghost"
                  size="sm"
                  message={r.deleteConfirm}
                  className="text-destructive"
                >
                  {r.delete}
                </ConfirmSubmit>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <div className="rounded-lg border border-border p-4">
        <p className="mb-3 text-sm font-medium">{r.upload}</p>
        <FileUpload
          url={`/api/uploads?target=character-reference&characterId=${encodeURIComponent(characterId)}`}
          accept="image/jpeg,image/png,image/webp"
          typesLabel="JPEG/PNG/WebP"
          maxMb={maxMb}
          consentText={consentText}
          consentVersion={consentVersion}
          buttonLabel={r.upload}
          hint={format(r.formats, { max: maxMb })}
          t={t}
          onUploaded={() => router.refresh()}
          testId="reference-upload"
        />
      </div>
    </div>
  );
}
