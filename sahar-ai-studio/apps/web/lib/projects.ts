import 'server-only';
import { prisma } from '@sahar/db';

/** Owned, non-deleted project or null (callers turn null into 404). */
export function findOwnedProject(ownerId: string, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, ownerId, deletedAt: null } });
}

/** Everything the project pages need, ownership-scoped. */
export function loadProject(ownerId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId, deletedAt: null },
    include: {
      mainCharacter: { select: { id: true, name: true, deletedAt: true } },
      masterAudio: { include: { audioAnalysis: true } },
      scenes: {
        orderBy: { position: 'asc' },
        include: {
          character: { select: { id: true, name: true } },
          referenceImage: { select: { id: true, assetId: true, label: true } },
          _count: { select: { takes: true } },
        },
      },
    },
  });
}

export type LoadedProject = NonNullable<Awaited<ReturnType<typeof loadProject>>>;

export function projectHasTakes(projectId: string) {
  return prisma.take.count({ where: { scene: { projectId } } }).then((count) => count > 0);
}
