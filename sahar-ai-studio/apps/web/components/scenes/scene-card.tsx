'use client';

import { AlertTriangle, UserRound } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { FormError } from '@/components/auth/form-message';
import { PrivateImage } from '@/components/media/private-image';
import { TakePlayer } from '@/components/studio/take-player';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatTime } from '@/lib/format';
import { format, type Dictionary } from '@/lib/i18n/config';
import type { SceneActionState } from '@/lib/scene-actions';

export interface SceneCharacterOption {
  id: string;
  name: string;
  references: { id: string; assetId: string; isPrimary: boolean }[];
}

export interface SceneCardData {
  id: string;
  position: number;
  startMs: number;
  endMs: number;
  status: keyof Dictionary['scenes']['status'];
  takes: number;
  characterId: string | null;
  referenceImageId: string | null;
  prompt: string;
  selectedTake: { assetId: string; takeNumber: number; isTestRender: boolean } | null;
}

const selectClass =
  'h-11 w-full rounded-md border border-input bg-surface px-3 text-base sm:h-10 sm:text-sm';

export function SceneCard({
  scene,
  characters,
  identity,
  action,
  t,
  common,
  sceneLabel,
  takeLabels,
}: {
  scene: SceneCardData;
  characters: SceneCharacterOption[];
  /** The project's main character + its primary reference, for the consistency check. */
  identity: { characterId: string | null; referenceImageId: string | null };
  action: (prev: SceneActionState, formData: FormData) => Promise<SceneActionState>;
  t: Dictionary['scenes'];
  common: Dictionary['common'];
  /** e.g. "סצנה {n}" */
  sceneLabel: string;
  takeLabels: { take: string; testBadge: string; download: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [characterId, setCharacterId] = useState(scene.characterId ?? '');
  const [referenceId, setReferenceId] = useState(scene.referenceImageId ?? '');
  // Server-side changes (e.g. "apply main character to all scenes") update the selection.
  useEffect(() => {
    setCharacterId(scene.characterId ?? '');
    setReferenceId(scene.referenceImageId ?? '');
  }, [scene.characterId, scene.referenceImageId]);
  const character = characters.find((c) => c.id === characterId);
  const reference = character?.references.find((r) => r.id === referenceId);
  const differs =
    identity.characterId !== null &&
    (characterId !== identity.characterId ||
      (identity.referenceImageId !== null && referenceId !== identity.referenceImageId));

  return (
    <li className="rounded-xl border border-border bg-card p-4" data-testid="scene-card">
      <form action={formAction} className="flex flex-col gap-4 sm:flex-row">
        <div className="flex shrink-0 flex-row gap-3 sm:w-36 sm:flex-col">
          <div className="aspect-[4/5] w-24 overflow-hidden rounded-lg border border-border bg-muted sm:w-full">
            {reference ? (
              <PrivateImage
                assetId={reference.assetId}
                alt={character?.name ?? ''}
                className="size-full"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <UserRound className="size-8" aria-hidden />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{format(sceneLabel, { n: scene.position + 1 })}</span>
            <bdi className="text-xs text-muted-foreground tabular-nums">
              {formatTime(scene.startMs)} – {formatTime(scene.endMs)}
            </bdi>
            <div className="flex flex-wrap gap-1">
              <Badge variant="muted">{t.status[scene.status]}</Badge>
              <Badge variant="muted">{format(t.takes, { count: scene.takes })}</Badge>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`character-${scene.id}`}>{t.character}</Label>
              <select
                id={`character-${scene.id}`}
                name="characterId"
                value={characterId}
                onChange={(event) => {
                  const next = characters.find((c) => c.id === event.target.value);
                  setCharacterId(event.target.value);
                  setReferenceId(
                    next?.references.find((r) => r.isPrimary)?.id ?? next?.references[0]?.id ?? '',
                  );
                }}
                className={selectClass}
              >
                <option value="">—</option>
                {characters.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`reference-${scene.id}`}>{t.reference}</Label>
              <select
                id={`reference-${scene.id}`}
                name="referenceImageId"
                value={referenceId}
                onChange={(event) => setReferenceId(event.target.value)}
                className={selectClass}
                disabled={!character}
              >
                <option value="">{t.noReference}</option>
                {character?.references.map((option, i) => (
                  <option key={option.id} value={option.id}>
                    {`#${i + 1}${option.isPrimary ? ' ★' : ''}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`prompt-${scene.id}`}>{t.prompt}</Label>
            <Textarea
              id={`prompt-${scene.id}`}
              name="prompt"
              defaultValue={scene.prompt}
              maxLength={2000}
              placeholder={t.promptPlaceholder}
              className="min-h-16"
            />
          </div>
          {differs ? (
            <p
              className="flex items-start gap-2 text-xs text-warning"
              data-testid="identity-warning"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t.identityWarning}
            </p>
          ) : null}
          <FormError message={state.error} />
          <div className="flex items-center gap-3">
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              {pending ? common.saving : t.save}
            </Button>
            {state.ok ? (
              <span role="status" className="text-sm text-success">
                {t.saved}
              </span>
            ) : null}
          </div>
        </div>
      </form>
      {scene.selectedTake ? (
        <div className="mt-4 border-t border-border pt-4" data-testid="selected-take">
          <p className="mb-2 text-sm font-medium">
            {format(takeLabels.take, { n: scene.selectedTake.takeNumber })}
          </p>
          <TakePlayer
            assetId={scene.selectedTake.assetId}
            isTestRender={scene.selectedTake.isTestRender}
            testBadge={takeLabels.testBadge}
            downloadLabel={takeLabels.download}
          />
        </div>
      ) : null}
    </li>
  );
}
