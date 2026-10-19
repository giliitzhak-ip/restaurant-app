import 'server-only';
import { prisma } from '@sahar/db';
import { CHARACTER_PRESETS, PRIMARY_PRESET_KEY } from '@sahar/shared';

/**
 * Copies built-in presets (Sharona Sahar) into the user's library once. Idempotent; a
 * preset the user deleted is not re-created (the soft-deleted row keeps its preset key).
 * No reference image is created — the user uploads an approved one.
 */
export async function ensurePresetCharacters(ownerId: string) {
  for (const preset of CHARACTER_PRESETS) {
    await prisma.character.upsert({
      where: { ownerId_presetKey: { ownerId, presetKey: preset.key } },
      update: {},
      create: {
        ownerId,
        presetKey: preset.key,
        name: preset.name,
        description: preset.description,
        defaultAppearance: preset.defaultAppearance,
        clothingPresets: {
          create: preset.clothingPresets.map((p, sortOrder) => ({ ...p, sortOrder })),
        },
        stylePresets: { create: preset.stylePresets.map((p, sortOrder) => ({ ...p, sortOrder })) },
      },
    });
  }
}

export const isPrimaryPreset = (presetKey: string | null) => presetKey === PRIMARY_PRESET_KEY;

/** Characters for pickers, main preset first. */
export async function listCharacterOptions(ownerId: string) {
  await ensurePresetCharacters(ownerId);
  const characters = await prisma.character.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      presetKey: true,
      referenceImages: {
        where: { asset: { status: 'READY' } },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, isPrimary: true, label: true, assetId: true },
      },
    },
  });
  return characters.sort(
    (a, b) => Number(isPrimaryPreset(b.presetKey)) - Number(isPrimaryPreset(a.presetKey)),
  );
}

export type CharacterOption = Awaited<ReturnType<typeof listCharacterOptions>>[number];

/** Owned, non-deleted character or null (callers turn null into 404). */
export function findOwnedCharacter(ownerId: string, characterId: string) {
  return prisma.character.findFirst({ where: { id: characterId, ownerId, deletedAt: null } });
}
