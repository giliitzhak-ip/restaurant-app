'use server';

import { prisma } from '@sahar/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from './audit';
import { requireUser } from './auth/session';
import { findOwnedCharacter } from './characters';
import { format } from './i18n/config';
import { getI18n } from './i18n/server';
import { logger } from './logger';
import { getStorage } from './storage';

export interface ActionState {
  ok?: boolean;
  error?: string;
}

const text = (max: number) => z.string().trim().max(max);
const characterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: text(1000),
  defaultAppearance: text(2000),
});

function readCharacter(formData: FormData) {
  return characterSchema.safeParse({
    name: formData.get('name') ?? '',
    description: formData.get('description') ?? '',
    defaultAppearance: formData.get('defaultAppearance') ?? '',
  });
}

export async function createCharacterAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const parsed = readCharacter(formData);
  if (!parsed.success) return { error: t.characters.edit.nameRequired };
  const character = await prisma.character.create({ data: { ownerId: user.id, ...parsed.data } });
  await audit({
    action: 'character.create',
    userId: user.id,
    metadata: { characterId: character.id },
  });
  redirect(`/characters/${character.id}`);
}

export async function updateCharacterAction(
  characterId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (!(await findOwnedCharacter(user.id, characterId))) return { error: t.notFound.title };
  const parsed = readCharacter(formData);
  if (!parsed.success) return { error: t.characters.edit.nameRequired };
  await prisma.character.update({ where: { id: characterId }, data: parsed.data });
  await audit({ action: 'character.update', userId: user.id, metadata: { characterId } });
  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

export async function deleteCharacterAction(
  characterId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (!(await findOwnedCharacter(user.id, characterId))) return { error: t.notFound.title };
  const [projects, scenes] = await Promise.all([
    prisma.project.count({ where: { mainCharacterId: characterId, deletedAt: null } }),
    prisma.scene.count({ where: { characterId, project: { deletedAt: null } } }),
  ]);
  if (projects > 0 || scenes > 0)
    return { error: format(t.characters.edit.deleteBlocked, { projects, scenes }) };
  await prisma.character.update({ where: { id: characterId }, data: { deletedAt: new Date() } });
  await audit({ action: 'character.delete', userId: user.id, metadata: { characterId } });
  redirect('/characters');
}

const presetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
});

export async function addPresetAction(
  characterId: string,
  kind: 'clothing' | 'style',
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (!(await findOwnedCharacter(user.id, characterId))) return { error: t.notFound.title };
  const parsed = presetSchema.safeParse({
    name: formData.get('name') ?? '',
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) return { error: t.characters.presets.invalid };
  const data = { characterId, ...parsed.data };
  if (kind === 'clothing') {
    const sortOrder = await prisma.characterClothingPreset.count({ where: { characterId } });
    await prisma.characterClothingPreset.create({ data: { ...data, sortOrder } });
  } else {
    const sortOrder = await prisma.characterStylePreset.count({ where: { characterId } });
    await prisma.characterStylePreset.create({ data: { ...data, sortOrder } });
  }
  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

export async function removePresetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const presetId = String(formData.get('presetId') ?? '');
  const kind = formData.get('kind');
  const where = { id: presetId, character: { ownerId: user.id } };
  const characterId =
    kind === 'clothing'
      ? (await prisma.characterClothingPreset.findFirst({ where, select: { characterId: true } }))
          ?.characterId
      : (await prisma.characterStylePreset.findFirst({ where, select: { characterId: true } }))
          ?.characterId;
  if (!characterId) return;
  if (kind === 'clothing') await prisma.characterClothingPreset.delete({ where: { id: presetId } });
  else await prisma.characterStylePreset.delete({ where: { id: presetId } });
  revalidatePath(`/characters/${characterId}`);
}

export async function setPrimaryReferenceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const referenceId = String(formData.get('referenceId') ?? '');
  const reference = await prisma.characterReferenceImage.findFirst({
    where: {
      id: referenceId,
      character: { ownerId: user.id, deletedAt: null },
      asset: { status: 'READY' },
    },
  });
  if (!reference) return;
  await prisma.$transaction([
    prisma.characterReferenceImage.updateMany({
      where: { characterId: reference.characterId },
      data: { isPrimary: false },
    }),
    prisma.characterReferenceImage.update({
      where: { id: reference.id },
      data: { isPrimary: true },
    }),
  ]);
  revalidatePath(`/characters/${reference.characterId}`);
}

export async function deleteReferenceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const referenceId = String(formData.get('referenceId') ?? '');
  const reference = await prisma.characterReferenceImage.findFirst({
    where: { id: referenceId, character: { ownerId: user.id } },
    include: { asset: { select: { id: true, storageKey: true } } },
  });
  if (!reference) return { error: t.notFound.title };

  // Scenes keep an explicit reference; deleting it would silently change their identity.
  const inUse = await prisma.scene.count({
    where: { referenceImageId: reference.id, project: { deletedAt: null } },
  });
  if (inUse > 0) return { error: format(t.characters.references.inUse, { count: inUse }) };

  await prisma.$transaction(async (tx) => {
    await tx.characterReferenceImage.delete({ where: { id: reference.id } });
    await tx.asset.delete({ where: { id: reference.asset.id } });
    if (reference.isPrimary) {
      const next = await tx.characterReferenceImage.findFirst({
        where: { characterId: reference.characterId, asset: { status: 'READY' } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (next)
        await tx.characterReferenceImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
    }
  });
  await getStorage()
    .delete([reference.asset.storageKey])
    .catch((error) =>
      logger.warn({ err: error, assetId: reference.asset.id }, 'failed to delete reference object'),
    );
  await audit({
    action: 'media.reference.delete',
    userId: user.id,
    metadata: { assetId: reference.asset.id },
  });
  revalidatePath(`/characters/${reference.characterId}`);
  return { ok: true };
}
