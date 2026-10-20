import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { GenerationStatus, Prisma, PrismaClient } from '@sahar/db';
import {
  GenerationAbortedError,
  isProviderKey,
  type GenerationInput,
  type ProviderKey,
  type VideoProvider,
} from '@sahar/providers';
import type { Logger } from '@sahar/shared/logger';
import { assetObjectKey, type ObjectStorage } from '@sahar/storage';
import { ffprobe } from '../media/ffmpeg';

export interface GenerationContext {
  db: PrismaClient;
  storage: ObjectStorage;
  log: Logger;
  providers: Map<ProviderKey, VideoProvider>;
  ffprobePath: string;
  tmpRoot: string;
  /** How often progress is written to the database (and cancellation is checked). */
  progressIntervalMs?: number;
}

/** Frozen inputs, written when the user approved the generation. */
export interface GenerationSnapshot {
  audioAssetId: string;
  referenceAssetId: string | null;
  startMs: number;
  endMs: number;
  width: number;
  height: number;
  fps: number;
  prompt: string;
  label: string;
}

/** A failure that retrying cannot fix (bad inputs, invalid output). */
export class PermanentGenerationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PermanentGenerationError';
  }
}

const TERMINAL: GenerationStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

async function recordEvent(
  db: PrismaClient | Prisma.TransactionClient,
  jobId: string,
  fromStatus: GenerationStatus | null,
  toStatus: GenerationStatus,
  message?: string,
  payload?: Prisma.InputJsonValue,
) {
  await db.generationJobEvent.create({
    data: {
      jobId,
      fromStatus,
      toStatus,
      message: message ?? null,
      ...(payload !== undefined ? { payload } : {}),
    },
  });
}

/** Scene status after a job ends: READY if any take exists, otherwise the job outcome. */
async function settleScene(
  tx: Prisma.TransactionClient,
  sceneId: string,
  outcome: 'FAILED' | 'DRAFT',
) {
  const [takes, active] = await Promise.all([
    tx.take.count({ where: { sceneId } }),
    tx.generationJob.count({
      where: { sceneId, status: { in: ['QUEUED', 'SUBMITTING', 'PROCESSING'] } },
    }),
  ]);
  const status = active > 0 ? 'GENERATING' : takes > 0 ? 'READY' : outcome;
  await tx.scene.update({ where: { id: sceneId }, data: { status } });
}

/**
 * Runs one approved generation job. Idempotent: terminal jobs are skipped, the
 * QUEUED → PROCESSING transition is a compare-and-set, and a re-run after a crash
 * re-renders (safe only for local providers, which cost nothing).
 */
export async function processGeneration(
  ctx: GenerationContext,
  jobId: string,
): Promise<'completed' | 'skipped' | 'cancelled'> {
  const { db, log } = ctx;
  const job = await db.generationJob.findUnique({ where: { id: jobId } });
  if (!job || TERMINAL.includes(job.status)) return 'skipped';

  if (!isProviderKey(job.providerKey))
    throw new PermanentGenerationError('provider_unknown', `unknown provider ${job.providerKey}`);
  const provider = ctx.providers.get(job.providerKey)!;
  if (provider.execution.kind !== 'local') {
    // Remote providers (Phase 4+) must poll an existing providerJobId, never resubmit blindly.
    throw new PermanentGenerationError(
      'provider_unsupported',
      'remote execution is not implemented yet',
    );
  }
  if (!provider.availability().operational)
    throw new PermanentGenerationError('provider_unavailable', 'provider is not operational');

  if (job.status === 'QUEUED') {
    const claimed = await db.generationJob.updateMany({
      where: { id: jobId, status: 'QUEUED' },
      data: {
        status: 'PROCESSING',
        submittedAt: new Date(),
        attempts: { increment: 1 },
        progress: 0,
      },
    });
    if (claimed.count === 0) return 'skipped'; // cancelled or claimed meanwhile
    await recordEvent(db, jobId, 'QUEUED', 'PROCESSING');
  } else {
    await db.generationJob.update({
      where: { id: jobId },
      data: { attempts: { increment: 1 }, progress: 0 },
    });
    await recordEvent(db, jobId, job.status, 'PROCESSING', 'resumed after interruption');
  }

  const snapshot = job.inputSnapshot as unknown as GenerationSnapshot;
  const workDir = await mkdtemp(path.join(ctx.tmpRoot, 'gen-'));
  const controller = new AbortController();
  try {
    // ── Inputs: the original song and the approved reference image ──────────────
    const [audio, reference] = await Promise.all([
      db.asset.findFirst({
        where: {
          id: snapshot.audioAssetId,
          ownerId: job.ownerId,
          status: 'READY',
          deletedAt: null,
        },
      }),
      snapshot.referenceAssetId
        ? db.asset.findFirst({
            where: {
              id: snapshot.referenceAssetId,
              ownerId: job.ownerId,
              status: 'READY',
              deletedAt: null,
            },
          })
        : Promise.resolve(null),
    ]);
    if (!audio)
      throw new PermanentGenerationError('source_missing', 'the song is no longer available');
    if (snapshot.referenceAssetId && !reference) {
      throw new PermanentGenerationError(
        'reference_missing',
        'the reference image is no longer available',
      );
    }
    const songPath = path.join(workDir, 'song');
    await ctx.storage.downloadToFile(audio.storageKey, songPath);
    let referencePath: string | null = null;
    if (reference) {
      referencePath = path.join(workDir, 'reference');
      await ctx.storage.downloadToFile(reference.storageKey, referencePath);
    }

    // ── Render with real progress; cancellation is checked on every progress write ──
    let lastWrite = 0;
    let pending: Promise<void> | null = null;
    const interval = ctx.progressIntervalMs ?? 500;
    const onProgress = (fraction: number) => {
      const now = Date.now();
      if (pending || (now - lastWrite < interval && fraction < 1)) return;
      lastWrite = now;
      pending = (async () => {
        const current = await db.generationJob.findUnique({
          where: { id: jobId },
          select: { status: true },
        });
        if (current?.status === 'CANCELLED') controller.abort();
        else
          await db.generationJob.update({
            where: { id: jobId },
            data: { progress: Math.min(fraction, 0.99) },
          });
      })()
        .catch((error) => log.warn({ err: error, jobId }, 'progress update failed'))
        .finally(() => {
          pending = null;
        });
    };

    const input: GenerationInput = {
      operation: job.operation,
      startMs: snapshot.startMs,
      endMs: snapshot.endMs,
      width: snapshot.width,
      height: snapshot.height,
      fps: snapshot.fps,
      songPath,
      referenceImagePath: referencePath,
      prompt: snapshot.prompt,
      label: snapshot.label,
    };
    const output = await provider.execution.run(input, {
      workDir,
      onProgress,
      signal: controller.signal,
    });
    await (pending ?? Promise.resolve());

    // ── Verify what was produced before anyone sees it ─────────────────────────
    const probe = await ffprobe(ctx.ffprobePath, output.path);
    const video = probe.streams?.find((s) => s.codec_type === 'video');
    const audioStream = probe.streams?.find((s) => s.codec_type === 'audio');
    const durationMs = Math.round(Number(probe.format?.duration) * 1000);
    const expectedMs = snapshot.endMs - snapshot.startMs;
    if (
      video?.codec_name !== 'h264' ||
      audioStream?.codec_name !== 'aac' ||
      video.width !== snapshot.width ||
      video.height !== snapshot.height ||
      !Number.isFinite(durationMs) ||
      Math.abs(durationMs - expectedMs) > 150
    ) {
      throw new PermanentGenerationError(
        'output_invalid',
        `unexpected output: ${JSON.stringify({ video, durationMs })}`,
      );
    }
    const bytes = await readFile(output.path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const sizeBytes = bytes.length;

    // ── Store the take, then commit the result atomically ──────────────────────
    const asset = await db.asset.create({
      data: {
        ownerId: job.ownerId,
        projectId: job.projectId,
        kind: 'VIDEO_TAKE',
        status: 'UPLOADED',
        bucket: ctx.storage.bucket,
        storageKey: `pending/${jobId}/${Date.now()}`,
        originalFilename: `scene-take-${jobId}.mp4`,
        mimeType: output.mimeType,
        sizeBytes: BigInt(sizeBytes),
        sha256,
        width: video.width,
        height: video.height,
        durationMs,
        metadata: {
          providerKey: provider.key,
          providerKind: provider.kind,
          generationJobId: jobId,
        },
      },
    });
    const storageKey = assetObjectKey(job.ownerId, asset.id, 'take.mp4');
    await ctx.storage.uploadStream(storageKey, createReadStream(output.path), output.mimeType);

    const result = await db.$transaction(async (tx) => {
      const completed = await tx.generationJob.updateMany({
        where: { id: jobId, status: 'PROCESSING' },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          progress: 1,
          // Local technical renders cost nothing; paid providers report their own amount.
          actualCostUsd: provider.capabilities.pricing.model === 'free' ? '0' : null,
          actualCostReportedAt: provider.capabilities.pricing.model === 'free' ? new Date() : null,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (completed.count === 0) return 'cancelled' as const;
      await tx.asset.update({ where: { id: asset.id }, data: { storageKey, status: 'READY' } });
      const last = await tx.take.findFirst({
        where: { sceneId: job.sceneId },
        orderBy: { takeNumber: 'desc' },
      });
      const take = await tx.take.create({
        data: {
          sceneId: job.sceneId,
          takeNumber: (last?.takeNumber ?? 0) + 1,
          generationJobId: jobId,
          videoAssetId: asset.id,
        },
      });
      const scene = await tx.scene.findUniqueOrThrow({
        where: { id: job.sceneId },
        select: { selectedTakeId: true },
      });
      if (!scene.selectedTakeId)
        await tx.scene.update({ where: { id: job.sceneId }, data: { selectedTakeId: take.id } });
      await settleScene(tx, job.sceneId, 'DRAFT');
      await recordEvent(tx, jobId, 'PROCESSING', 'COMPLETED', undefined, {
        takeId: take.id,
        assetId: asset.id,
        durationMs,
      });
      return 'completed' as const;
    });

    if (result === 'cancelled') {
      // Cancelled while uploading: the result is discarded, not shown.
      await db.asset.delete({ where: { id: asset.id } });
      await ctx.storage.delete([storageKey]).catch(() => undefined);
      return 'cancelled';
    }
    log.info({ jobId, sceneId: job.sceneId, durationMs, sizeBytes }, 'generation completed');
    return 'completed';
  } catch (error) {
    if (error instanceof GenerationAbortedError) {
      await db.$transaction(async (tx) => {
        await settleScene(tx, job.sceneId, 'DRAFT');
      });
      log.info({ jobId }, 'generation cancelled during render');
      return 'cancelled';
    }
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Marks a job FAILED with a stable error code (called for permanent errors or exhausted retries). */
export async function failGeneration(
  db: PrismaClient,
  jobId: string,
  code: string,
  message: string,
) {
  await db.$transaction(async (tx) => {
    const job = await tx.generationJob.findUnique({ where: { id: jobId } });
    if (!job || TERMINAL.includes(job.status)) return;
    await tx.generationJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorCode: code,
        errorMessage: message.slice(0, 1000),
      },
    });
    await recordEvent(tx, jobId, job.status, 'FAILED', code);
    await settleScene(tx, job.sceneId, 'FAILED');
  });
}
