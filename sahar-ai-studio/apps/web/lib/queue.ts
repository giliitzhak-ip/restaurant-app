import 'server-only';
import {
  GENERATION_JOB,
  GENERATION_JOB_OPTIONS,
  mediaJobId,
  QUEUE_NAMES,
  type GenerationJobData,
  type MediaJobData,
  type MediaJobName,
} from '@sahar/shared';
import { Queue } from 'bullmq';
import { getServerEnv } from './env';

const globalForQueue = globalThis as unknown as {
  __saharMediaQueue?: Queue<MediaJobData>;
  __saharGenerationQueue?: Queue<GenerationJobData>;
};

function connection() {
  const url = new URL(getServerEnv().REDIS_URL);
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    db: Number.isInteger(db) ? db : 0,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

function mediaQueue() {
  globalForQueue.__saharMediaQueue ??= new Queue<MediaJobData>(QUEUE_NAMES.media, {
    connection: connection(),
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: 'exponential', delay: 3_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    },
  });
  return globalForQueue.__saharMediaQueue;
}

/** Enqueues verification/analysis of an uploaded asset (deduplicated per asset). */
export async function enqueueMediaJob(name: MediaJobName, assetId: string) {
  await mediaQueue().add(name, { assetId }, { jobId: mediaJobId(name, assetId) });
}

function generationQueue() {
  globalForQueue.__saharGenerationQueue ??= new Queue<GenerationJobData>(QUEUE_NAMES.generation, {
    connection: connection(),
  });
  return globalForQueue.__saharGenerationQueue;
}

/** The BullMQ job id is the GenerationJob id, so a job can never be enqueued twice. */
export async function enqueueGeneration(generationJobId: string) {
  await generationQueue().add(
    GENERATION_JOB,
    { generationJobId },
    { ...GENERATION_JOB_OPTIONS, jobId: generationJobId },
  );
}

/** Removes a job that has not started yet (no-op if it is running or gone). */
export async function removeQueuedGeneration(generationJobId: string) {
  const job = await generationQueue().getJob(generationJobId);
  if (job && ((await job.isWaiting()) || (await job.isDelayed())))
    await job.remove().catch(() => undefined);
}
