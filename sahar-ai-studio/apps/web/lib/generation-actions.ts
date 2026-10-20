'use server';

import { Prisma, prisma } from '@sahar/db';
import { isProviderKey } from '@sahar/providers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from './audit';
import { requireUser } from './auth/session';
import { loadSceneForGeneration, planScene, sceneLabel } from './generation';
import { format } from './i18n/config';
import { getI18n } from './i18n/server';
import { logger } from './logger';
import { getRequestMeta } from './request';
import { enqueueGeneration, removeQueuedGeneration } from './queue';

export interface GenerationActionResult {
  ok?: boolean;
  jobId?: string;
  error?: string;
}

const MAX_ACTIVE_JOBS_PER_USER = 10;

const requestSchema = z.object({
  sceneId: z.string().min(1).max(64),
  providerKey: z.string().max(32),
  /** The exact estimate the user saw and approved. */
  approvedAmountUsd: z.string().regex(/^\d+\.\d{2,4}$/),
  approved: z.literal(true),
  /** One per approval: a repeated submit (double tap, retry) returns the same job. */
  idempotencyKey: z.string().uuid(),
});

/**
 * Creates an approved generation job and queues it. Nothing billable can start without:
 * an explicit approval, an estimate identical to what the user approved, a monthly budget
 * with room for it (billable providers), and a unique idempotency key.
 */
export async function requestGenerationAction(input: unknown): Promise<GenerationActionResult> {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const e = t.studio.errors;

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: parsed.error.issues.some((i) => i.path[0] === 'approved')
        ? e.approvalRequired
        : e.invalid,
    };
  const { sceneId, providerKey, approvedAmountUsd, idempotencyKey } = parsed.data;
  if (!isProviderKey(providerKey)) return { error: e.invalid };

  const existing = await prisma.generationJob.findUnique({
    where: { idempotencyKey },
    select: { id: true, ownerId: true },
  });
  if (existing)
    return existing.ownerId === user.id ? { ok: true, jobId: existing.id } : { error: e.invalid };

  const scene = await loadSceneForGeneration(user.id, sceneId);
  if (!scene) return { error: t.notFound.title };
  const plan = planScene(scene, providerKey);
  if (plan.problem) return { error: e[plan.problem] };
  const estimate = plan.estimate!;
  if (estimate.amountUsd !== approvedAmountUsd) return { error: e.estimateChanged };

  const characterId = scene.character && !scene.character.deletedAt ? scene.character.id : null;
  const snapshot = {
    audioAssetId: scene.project.masterAudio!.id,
    referenceAssetId: scene.referenceImage?.asset.id ?? null,
    startMs: plan.request.startMs,
    endMs: plan.request.endMs,
    width: plan.request.width,
    height: plan.request.height,
    fps: plan.request.fps,
    prompt: [
      scene.character && !scene.character.deletedAt ? scene.character.defaultAppearance : '',
      scene.prompt,
    ]
      .filter(Boolean)
      .join(' — '),
    label: sceneLabel(scene.position, scene.startMs, scene.endMs),
  };

  let jobId: string;
  try {
    jobId = await prisma.$transaction(async (tx) => {
      // Serialize approvals per user so concurrent requests cannot overrun the budget.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

      const active = await tx.generationJob.count({
        where: { ownerId: user.id, status: { in: ['QUEUED', 'SUBMITTING', 'PROCESSING'] } },
      });
      if (active >= MAX_ACTIVE_JOBS_PER_USER)
        throw new GenerationRefused(format(e.tooManyActive, { max: MAX_ACTIVE_JOBS_PER_USER }));

      if (estimate.billable) {
        const owner = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { monthlyBudgetUsd: true },
        });
        if (owner.monthlyBudgetUsd === null) throw new GenerationRefused(e.budgetNotSet);
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const rows = await tx.$queryRaw<{ total: Prisma.Decimal | null }[]>`
          SELECT SUM(COALESCE("actualCostUsd", "estimatedCostUsd")) AS total
          FROM "GenerationJob"
          WHERE "ownerId" = ${user.id} AND "approvedAt" >= ${monthStart}
            AND NOT ("status" = 'CANCELLED' AND "submittedAt" IS NULL)`;
        const spent = new Prisma.Decimal(rows[0]?.total ?? 0);
        if (spent.plus(estimate.amountUsd).greaterThan(owner.monthlyBudgetUsd))
          throw new GenerationRefused(e.budgetExceeded);
      }

      const job = await tx.generationJob.create({
        data: {
          ownerId: user.id,
          projectId: scene.project.id,
          sceneId: scene.id,
          characterId,
          providerKey,
          operation: plan.request.operation,
          status: 'QUEUED',
          idempotencyKey,
          inputSnapshot: snapshot,
          estimatedCostUsd: estimate.amountUsd,
          estimatedUnits: estimate.units,
          unitName: estimate.unitName,
          approvedAt: new Date(),
        },
      });
      await tx.generationJobEvent.create({
        data: {
          jobId: job.id,
          fromStatus: null,
          toStatus: 'QUEUED',
          payload: { estimate: { ...estimate }, locale },
        },
      });
      await tx.scene.update({ where: { id: scene.id }, data: { status: 'GENERATING' } });
      return job.id;
    });
  } catch (error) {
    if (error instanceof GenerationRefused) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const again = await prisma.generationJob.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (again) return { ok: true, jobId: again.id };
    }
    throw error;
  }

  try {
    await enqueueGeneration(jobId);
  } catch (error) {
    // The job row exists; the worker's startup reconciliation re-enqueues it.
    logger.error({ err: error, jobId }, 'failed to enqueue generation');
  }
  const meta = await getRequestMeta();
  await audit({
    action: 'generation.request',
    userId: user.id,
    ipAddress: meta.ipAddress,
    metadata: {
      jobId,
      providerKey,
      sceneId,
      estimateUsd: estimate.amountUsd,
      billable: estimate.billable,
    },
  });
  revalidatePath('/studio');
  revalidatePath('/renders');
  return { ok: true, jobId };
}

class GenerationRefused extends Error {}

/** Cancels a job that is queued or rendering (local providers stop within a second). */
export async function cancelGenerationAction(jobId: string): Promise<GenerationActionResult> {
  const user = await requireUser();
  const { t } = await getI18n();
  const job = await prisma.generationJob.findFirst({ where: { id: jobId, ownerId: user.id } });
  if (!job) return { error: t.notFound.title };

  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.generationJob.updateMany({
      where: { id: jobId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (updated.count === 0) return false;
    await tx.generationJobEvent.create({
      data: { jobId, fromStatus: job.status, toStatus: 'CANCELLED', message: 'cancelled by user' },
    });
    const [takes, active] = await Promise.all([
      tx.take.count({ where: { sceneId: job.sceneId } }),
      tx.generationJob.count({
        where: { sceneId: job.sceneId, status: { in: ['QUEUED', 'SUBMITTING', 'PROCESSING'] } },
      }),
    ]);
    await tx.scene.update({
      where: { id: job.sceneId },
      data: { status: active > 0 ? 'GENERATING' : takes > 0 ? 'READY' : 'DRAFT' },
    });
    return true;
  });
  if (!cancelled) return { error: t.studio.errors.notCancellable };
  await removeQueuedGeneration(jobId).catch(() => undefined);
  await audit({ action: 'generation.cancel', userId: user.id, metadata: { jobId } });
  revalidatePath('/studio');
  revalidatePath('/renders');
  return { ok: true };
}
