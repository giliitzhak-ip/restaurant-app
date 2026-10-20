import { prisma } from '@sahar/db';
import { Plus, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PrivateImage } from '@/components/media/private-image';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';
import { ensurePresetCharacters, isPrimaryPreset } from '@/lib/characters';
import { format } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.characters.title };
}

export default async function CharactersPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  await ensurePresetCharacters(user.id);
  const characters = await prisma.character.findMany({
    where: { ownerId: user.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      presetKey: true,
      referenceImages: {
        where: { asset: { status: 'READY' } },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        select: { assetId: true },
      },
    },
  });
  characters.sort(
    (a, b) => Number(isPrimaryPreset(b.presetKey)) - Number(isPrimaryPreset(a.presetKey)),
  );

  return (
    <>
      <PageHeader
        title={t.characters.title}
        description={t.characters.description}
        actions={
          <Button asChild>
            <Link href="/characters/new">
              <Plus aria-hidden />
              {t.characters.create.title}
            </Link>
          </Button>
        }
      />
      <ul
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="character-list"
      >
        {characters.map((character) => {
          const cover = character.referenceImages[0];
          return (
            <li key={character.id}>
              <Link
                href={`/characters/${character.id}`}
                className="group flex h-full gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold-500/50"
                data-testid="character-card"
              >
                <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                  {cover ? (
                    <PrivateImage
                      assetId={cover.assetId}
                      alt={character.name}
                      className="size-full"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <UserRound className="size-8" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold group-hover:text-gold-200">
                      <bdi>{character.name}</bdi>
                    </span>
                    {isPrimaryPreset(character.presetKey) ? (
                      <Badge>{t.characters.primaryBadge}</Badge>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {character.description}
                  </p>
                  <p className="mt-auto text-xs text-muted-foreground">
                    {character.referenceImages.length > 0
                      ? format(t.characters.referenceCount, {
                          count: character.referenceImages.length,
                        })
                      : t.characters.noReference}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
