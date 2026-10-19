'use server';

import { prisma } from '@sahar/db';
import { validateSceneLayout, type SceneLayoutError } from '@sahar/media';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from './audit';
import { requireUser } from './auth/session';
import { getI18n } from './i18n/server';

export interface SceneActionState {
  ok?: boolean;
  error?: string;
}

export interface SavedLayout extends SceneActionState {
  scenes?: { id: string; startMs: number; endMs: number; locked: boolean }[];
}

const layoutSchema = z
  .array(
    z.object({
      id: z.string().max(64).optional(),
      startMs: z.number().int().min(0),
      endMs: z.number().int().min(0),
    }),
  )
  .max(1000);

/** Defaults that keep one identity across the video: main character + its primary image. */
async function identityDefaults(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      mainCharacter: {
        select: {
          id: true,
          deletedAt: true,
          referenceImages: {
            where: { isPrimary: true, asset: { status: 'READY' } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  const character =
    project.mainCharacter && !project.mainCharacter.deletedAt ? project.mainCharacter : null;
  return {
    characterId: character?.id ?? null,
    referenceImageId: character?.referenceImages[0]?.id ?? null,
  };
}

/**
 * Saves the whole scene layout. Existing scenes are updated in place (keeping their
 * prompt, character and takes), new ones get the identity defaults, and scenes that
 * disappeared are deleted — unless they have takes.
 */
export async function saveSceneLayoutAction(
  projectId: string,
  input: unknown,
): Promise<SavedLayout> {
  const user = await requireUser();
  const { t } = await getI18n();
  const errors = t.timeline.errors;

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id, deletedAt: null },
    select: {
      id: true,
      masterAudio: { select: { status: true, audioAnalysis: { select: { durationMs: true } } } },
    },
  });
  const durationMs =
    project?.masterAudio?.status === 'READY'
      ? project.masterAudio.audioAnalysis?.durationMs
      : undefined;
  if (!project || durationMs === undefined) return { error: t.timeline.notReady };

  const parsed = layoutSchema.safeParse(input);
  if (!parsed.success) return { error: errors.gapOrOverlap };
  const layout = parsed.data;
  const problem: SceneLayoutError | null = validateSceneLayout(layout, durationMs);
  if (problem) return { error: errors[problem] };

  const existing = await prisma.scene.findMany({
    where: { projectId },
    select: { id: true, _count: { select: { takes: true } } },
  });
  const existingIds = new Set(existing.map((scene) => scene.id));
  const keptIds = new Set(layout.flatMap((scene) => (scene.id ? [scene.id] : [])));
  if (
    [...keptIds].some((id) => !existingIds.has(id)) ||
    keptIds.size !== layout.filter((s) => s.id).length
  ) {
    return { error: errors.stale };
  }
  const removed = existing.filter((scene) => !keptIds.has(scene.id));
  if (removed.some((scene) => scene._count.takes > 0)) return { error: errors.sceneHasTakes };

  const defaults = await identityDefaults(projectId);
  const takesById = new Map(existing.map((scene) => [scene.id, scene._count.takes]));
  const saved = await prisma.$transaction(async (tx) => {
    const result: NonNullable<SavedLayout['scenes']> = [];
    if (removed.length > 0)
      await tx.scene.deleteMany({ where: { id: { in: removed.map((scene) => scene.id) } } });
    for (const [position, scene] of layout.entries()) {
      if (scene.id) {
        await tx.scene.update({
          where: { id: scene.id },
          data: { position, startMs: scene.startMs, endMs: scene.endMs },
        });
        result.push({
          id: scene.id,
          startMs: scene.startMs,
          endMs: scene.endMs,
          locked: (takesById.get(scene.id) ?? 0) > 0,
        });
      } else {
        const created = await tx.scene.create({
          data: { projectId, position, startMs: scene.startMs, endMs: scene.endMs, ...defaults },
          select: { id: true },
        });
        result.push({ id: created.id, startMs: scene.startMs, endMs: scene.endMs, locked: false });
      }
    }
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return result;
  });

  await audit({
    action: 'project.scenes.update',
    userId: user.id,
    metadata: { projectId, scenes: layout.length },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/timeline`);
  revalidatePath(`/projects/${projectId}/scenes`);
  return { ok: true, scenes: saved };
}

const sceneSchema = z.object({
  characterId: z.string().max(64),
  referenceImageId: z.string().max(64),
  prompt: z.string().trim().max(2000),
});

/** Per-scene character, reference image and prompt. Everything must belong to the user. */
export async function updateSceneAction(
  sceneId: string,
  _prev: SceneActionState,
  formData: FormData,
): Promise<SceneActionState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, project: { ownerId: user.id, deletedAt: null } },
    select: { id: true, projectId: true },
  });
  if (!scene) return { error: t.notFound.title };

  const parsed = sceneSchema.safeParse({
    characterId: formData.get('characterId') ?? '',
    referenceImageId: formData.get('referenceImageId') ?? '',
    prompt: formData.get('prompt') ?? '',
  });
  if (!parsed.success) return { error: t.scenes.invalid };
  const { characterId, referenceImageId, prompt } = parsed.data;

  if (characterId) {
    const character = await prisma.character.findFirst({
      where: { id: characterId, ownerId: user.id, deletedAt: null },
    });
    if (!character) return { error: t.scenes.invalid };
  }
  if (referenceImageId) {
    // The image must be a ready reference of the chosen character.
    const reference = await prisma.characterReferenceImage.findFirst({
      where: {
        id: referenceImageId,
        characterId: characterId || '__none__',
        asset: { status: 'READY' },
      },
    });
    if (!reference) return { error: t.scenes.invalid };
  }

  await prisma.scene.update({
    where: { id: scene.id },
    data: { characterId: characterId || null, referenceImageId: referenceImageId || null, prompt },
  });
  revalidatePath(`/projects/${scene.projectId}/scenes`);
  return { ok: true };
}

/** Points every scene at the main character and its primary reference image. */
export async function applyMainCharacterAction(
  projectId: string,
  _prev: SceneActionState,
): Promise<SceneActionState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: user.id, deletedAt: null },
  });
  if (!project) return { error: t.notFound.title };
  const defaults = await identityDefaults(projectId);
  await prisma.scene.updateMany({ where: { projectId }, data: defaults });
  revalidatePath(`/projects/${projectId}/scenes`);
  return { ok: true };
}
