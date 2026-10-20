import { prisma } from '@sahar/db';
import { CONSENT_STATEMENTS } from '@sahar/shared';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CharacterForm } from '@/components/characters/character-form';
import { DeleteCharacter } from '@/components/characters/delete-character';
import { PresetList } from '@/components/characters/preset-list';
import { ReferenceGallery } from '@/components/characters/reference-gallery';
import { EmptyList } from '@/components/empty-list';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import {
  addPresetAction,
  deleteCharacterAction,
  updateCharacterAction,
} from '@/lib/character-actions';
import { isPrimaryPreset } from '@/lib/characters';
import { getServerEnv } from '@/lib/env';
import { checkHealth } from '@/lib/health';
import { getI18n } from '@/lib/i18n/server';

type Params = { params: Promise<{ characterId: string }> };

async function load(ownerId: string, characterId: string) {
  return prisma.character.findFirst({
    where: { id: characterId, ownerId, deletedAt: null },
    include: {
      referenceImages: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          asset: {
            select: { id: true, status: true, failureReason: true, width: true, height: true },
          },
        },
      },
      clothingPresets: { orderBy: { sortOrder: 'asc' } },
      stylePresets: { orderBy: { sortOrder: 'asc' } },
      generationJobs: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, status: true, providerKey: true, createdAt: true },
      },
    },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const user = await requireUser();
  const character = await load(user.id, (await params).characterId);
  return { title: character?.name };
}

export default async function CharacterPage({ params }: Params) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const { characterId } = await params;
  const character = await load(user.id, characterId);
  if (!character) notFound();
  const health = await checkHealth();
  const consent = CONSENT_STATEMENTS.FACE_LIKENESS;

  return (
    <>
      <Link
        href="/characters"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t.characters.edit.back}
      </Link>
      <PageHeader
        title={<bdi>{character.name}</bdi>}
        actions={
          isPrimaryPreset(character.presetKey) ? (
            <Badge>{t.characters.primaryBadge}</Badge>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle>{t.characters.references.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReferenceGallery
              characterId={character.id}
              characterName={character.name}
              items={character.referenceImages.map((ref) => ({
                id: ref.id,
                assetId: ref.asset.id,
                isPrimary: ref.isPrimary,
                status: ref.asset.status,
                failureReason: ref.asset.failureReason,
                width: ref.asset.width,
                height: ref.asset.height,
              }))}
              t={t}
              maxMb={getServerEnv().MAX_IMAGE_UPLOAD_MB}
              consentText={consent[locale]}
              consentVersion={consent.version}
              workerOnline={health.worker}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.characters.edit.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <CharacterForm
              action={updateCharacterAction.bind(null, character.id)}
              t={t.characters}
              common={t.common}
              initial={{
                name: character.name,
                description: character.description,
                defaultAppearance: character.defaultAppearance,
              }}
              submitLabel={t.common.save}
              savedLabel={t.characters.edit.saved}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.characters.presets.clothingTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <PresetList
              kind="clothing"
              items={character.clothingPresets}
              addAction={addPresetAction.bind(null, character.id, 'clothing')}
              t={t.characters.presets}
              testId="clothing-presets"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.characters.presets.styleTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <PresetList
              kind="style"
              items={character.stylePresets}
              addAction={addPresetAction.bind(null, character.id, 'style')}
              t={t.characters.presets}
              testId="style-presets"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.characters.history.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {character.generationJobs.length === 0 ? (
              <EmptyList label={t.characters.history.empty} />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {character.generationJobs.map((job) => (
                  <li key={job.id} className="flex justify-between py-2">
                    <span>{job.providerKey}</span>
                    <Badge variant="muted">{job.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-8">
        <DeleteCharacter
          action={deleteCharacterAction.bind(null, character.id)}
          label={t.characters.edit.delete}
          confirm={t.characters.edit.deleteConfirm}
        />
      </div>
    </>
  );
}
