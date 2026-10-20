import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prisma } from '@sahar/db';
import {
  GENERATION_JOB,
  GENERATION_JOB_OPTIONS,
  MAINTENANCE_JOBS,
  MEDIA_JOBS,
  QUEUE_NAMES,
  type GenerationJobData,
  type MediaJobData,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SECONDS,
} from '@sahar/shared';
import { getServerEnv } from '@sahar/shared/env';
import { createLogger } from '@sahar/shared/logger';
import { createProviderRegistry } from '@sahar/providers';
import { storageFromEnv } from '@sahar/storage';
import { Queue, UnrecoverableError, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { connectionFromUrl } from './connection';
import { analyzeAudio } from './jobs/analyze-audio';
import { failGeneration, PermanentGenerationError, processGeneration } from './jobs/generate';
import { InvalidMediaError, type MediaContext } from './jobs/media-context';
import { purgeExpiredSessions } from './jobs/purge-expired-sessions';
import { verifyImage } from './jobs/verify-image';

const env = getServerEnv();
const log = createLogger('worker', env.LOG_LEVEL);
const connection = connectionFromUrl(env.REDIS_URL);

const maintenanceQueue = new Queue(QUEUE_NAMES.maintenance, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

const maintenanceWorker = new Worker(
  QUEUE_NAMES.maintenance,
  async (job) => {
    switch (job.name) {
      case MAINTENANCE_JOBS.purgeExpiredSessions: {
        const deleted = await purgeExpiredSessions(prisma);
        log.info({ jobId: job.id, deleted }, 'purged expired sessions');
        return { deleted };
      }
      default:
        throw new Error(`Unknown maintenance job: ${job.name}`);
    }
  },
  { connection, concurrency: 1 },
);

maintenanceWorker.on('failed', (job, error) =>
  log.error(
    { jobId: job?.id, name: job?.name, attempts: job?.attemptsMade, err: error },
    'job failed',
  ),
);
maintenanceWorker.on('error', (error) => log.error({ err: error }, 'worker error'));

// ─── Media: verification and analysis of uploads ───────────────────────────────
const tmpRoot = path.join(tmpdir(), 'sahar-worker');
const mediaContext: MediaContext = {
  db: prisma,
  storage: storageFromEnv(env),
  log,
  ffmpegPath: env.FFMPEG_PATH,
  ffprobePath: env.FFPROBE_PATH,
  tmpRoot,
};

async function markFailed(assetId: string, reason: string, deleteObject: boolean) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status === 'READY') return;
  await prisma.asset.update({
    where: { id: assetId },
    data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
  });
  // Content that failed verification is not kept in storage.
  if (deleteObject) await mediaContext.storage.delete([asset.storageKey]).catch(() => undefined);
}

const mediaWorker = new Worker<MediaJobData>(
  QUEUE_NAMES.media,
  async (job) => {
    const { assetId } = job.data;
    try {
      switch (job.name) {
        case MEDIA_JOBS.verifyImage:
          return { result: await verifyImage(mediaContext, assetId) };
        case MEDIA_JOBS.analyzeAudio:
          return { result: await analyzeAudio(mediaContext, assetId) };
        default:
          throw new UnrecoverableError(`Unknown media job: ${job.name}`);
      }
    } catch (error) {
      if (error instanceof InvalidMediaError) {
        log.warn({ jobId: job.id, assetId, reason: error.reason }, 'media rejected');
        await markFailed(assetId, error.reason, true);
        throw new UnrecoverableError(error.reason);
      }
      throw error;
    }
  },
  { connection, concurrency: 2, lockDuration: 120_000 },
);

mediaWorker.on('failed', (job, error) => {
  log.error(
    { jobId: job?.id, name: job?.name, attempts: job?.attemptsMade, err: error },
    'media job failed',
  );
  const exhausted = job && job.attemptsMade >= (job.opts.attempts ?? 1);
  if (job && exhausted && !(error instanceof UnrecoverableError)) {
    void markFailed(job.data.assetId, 'processing failed after retries', false);
  }
});
mediaWorker.on('error', (error) => log.error({ err: error }, 'media worker error'));

// ─── Generation: approved provider jobs (Mock renders locally with FFmpeg) ───────
const providers = createProviderRegistry({
  ffmpegPath: env.FFMPEG_PATH,
  fontRegular: env.MOCK_FONT_REGULAR,
  fontBold: env.MOCK_FONT_BOLD,
});
const generationQueue = new Queue<GenerationJobData>(QUEUE_NAMES.generation, { connection });
const generationContext = {
  db: prisma,
  storage: mediaContext.storage,
  log,
  providers,
  ffprobePath: env.FFPROBE_PATH,
  tmpRoot,
};

const generationWorker = new Worker<GenerationJobData>(
  QUEUE_NAMES.generation,
  async (job) => {
    const { generationJobId } = job.data;
    try {
      return { result: await processGeneration(generationContext, generationJobId) };
    } catch (error) {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (error instanceof PermanentGenerationError) {
        await failGeneration(prisma, generationJobId, error.code, error.message);
        throw new UnrecoverableError(error.code);
      }
      if (finalAttempt) {
        await failGeneration(
          prisma,
          generationJobId,
          'render_failed',
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  },
  {
    connection,
    // Rendering is CPU-bound: one at a time by default.
    concurrency: env.GENERATION_CONCURRENCY,
    lockDuration: 120_000,
  },
);
generationWorker.on('failed', (job, error) =>
  log.error(
    { jobId: job?.id, attempts: job?.attemptsMade, err: error.message },
    'generation attempt failed',
  ),
);
generationWorker.on('error', (error) => log.error({ err: error }, 'generation worker error'));

/**
 * Jobs still QUEUED/PROCESSING in the database but missing from Redis (e.g. Redis was
 * flushed, or the worker died) are enqueued again. The job id equals the database id, so
 * this never duplicates work; local renders are safe to repeat.
 */
async function reconcileGenerations() {
  const open = await prisma.generationJob.findMany({
    where: { status: { in: ['QUEUED', 'PROCESSING'] } },
    select: { id: true },
  });
  let requeued = 0;
  for (const { id } of open) {
    const existing = await generationQueue.getJob(id);
    const state = existing ? await existing.getState() : 'missing';
    if (state === 'completed' || state === 'failed') await existing!.remove();
    if (state === 'completed' || state === 'failed' || state === 'missing') {
      await generationQueue.add(
        GENERATION_JOB,
        { generationJobId: id },
        { ...GENERATION_JOB_OPTIONS, jobId: id },
      );
      requeued++;
    }
  }
  if (requeued > 0) log.warn({ requeued }, 're-enqueued unfinished generation jobs');
}

// Liveness signal read by the web dashboard.
const heartbeatRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
heartbeatRedis.on('error', (error) => log.warn({ err: error.message }, 'heartbeat redis error'));
async function beat() {
  try {
    await heartbeatRedis.set(
      WORKER_HEARTBEAT_KEY,
      new Date().toISOString(),
      'EX',
      WORKER_HEARTBEAT_TTL_SECONDS,
    );
  } catch (error) {
    log.warn({ err: error }, 'failed to write heartbeat');
  }
}

async function start() {
  await mkdir(tmpRoot, { recursive: true });
  // Idempotent: upserting the scheduler keeps exactly one repeatable job across restarts.
  await maintenanceQueue.upsertJobScheduler(
    'purge-expired-sessions-hourly',
    { pattern: '0 * * * *' },
    { name: MAINTENANCE_JOBS.purgeExpiredSessions },
  );
  await beat();
  await reconcileGenerations();
  log.info({ queues: Object.values(QUEUE_NAMES) }, 'worker started');
}

const heartbeatTimer = setInterval(() => void beat(), WORKER_HEARTBEAT_INTERVAL_MS);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'worker shutting down');
  clearInterval(heartbeatTimer);
  // Let the in-flight job finish before closing connections.
  await Promise.all([maintenanceWorker.close(), mediaWorker.close(), generationWorker.close()]);
  await generationQueue.close();
  await maintenanceQueue.close();
  await heartbeatRedis.del(WORKER_HEARTBEAT_KEY).catch(() => undefined);
  heartbeatRedis.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error: unknown) => {
  log.fatal({ err: error }, 'worker failed to start');
  process.exit(1);
});
