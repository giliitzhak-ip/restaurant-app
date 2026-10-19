import type { Prisma } from '@sahar/db';
import type { SceneSpan } from '@sahar/media';

/**
 * Creates the first scene layout for a project that has none. Every scene starts with the
 * project's main character and that character's primary reference image, so the same
 * identity is used across the whole video unless the user changes a scene explicitly.
 */
export async function createInitialScenes(
  tx: Prisma.TransactionClient,
  projectId: string,
  spans: SceneSpan[],
) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      mainCharacterId: true,
      _count: { select: { scenes: true } },
      mainCharacter: {
        select: {
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
  if (!project || project._count.scenes > 0) return 0;

  const characterId =
    project.mainCharacter && !project.mainCharacter.deletedAt ? project.mainCharacterId : null;
  const referenceImageId = characterId
    ? (project.mainCharacter?.referenceImages[0]?.id ?? null)
    : null;
  const { count } = await tx.scene.createMany({
    data: spans.map((span, position) => ({
      projectId,
      position,
      startMs: span.startMs,
      endMs: span.endMs,
      characterId,
      referenceImageId,
    })),
  });
  return count;
}
