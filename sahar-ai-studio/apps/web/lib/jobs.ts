import 'server-only';
import { prisma, type Prisma } from '@sahar/db';

/** Generation jobs with what the job list needs, always scoped to the owner. */
export function listJobs(ownerId: string, where: Prisma.GenerationJobWhereInput = {}, take = 30) {
  return prisma.generationJob.findMany({
    where: { ownerId, ...where },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      status: true,
      progress: true,
      providerKey: true,
      errorCode: true,
      createdAt: true,
      estimatedCostUsd: true,
      actualCostUsd: true,
      scene: { select: { position: true } },
      project: { select: { id: true, title: true } },
      take: {
        select: {
          takeNumber: true,
          videoAsset: { select: { id: true, status: true, metadata: true } },
        },
      },
    },
  });
}

type JobRow = Awaited<ReturnType<typeof listJobs>>[number];

/** Plain, serializable shape for the client component. */
export function toJobView(job: JobRow) {
  const cost = job.actualCostUsd ?? job.estimatedCostUsd;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    providerKey: job.providerKey,
    errorCode: job.errorCode,
    createdAt: job.createdAt.toISOString(),
    costUsd: cost ? Number(cost).toFixed(2) : null,
    costIsActual: job.actualCostUsd !== null,
    scenePosition: job.scene.position,
    projectId: job.project.id,
    projectTitle: job.project.title,
    takeNumber: job.take?.takeNumber ?? null,
    videoAssetId: job.take?.videoAsset?.status === 'READY' ? job.take.videoAsset.id : null,
    isTestRender:
      (job.take?.videoAsset?.metadata as { providerKind?: string } | null)?.providerKind ===
        'technical-test' || job.providerKey === 'mock',
  };
}

export type JobView = ReturnType<typeof toJobView>;
