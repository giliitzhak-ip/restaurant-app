import 'server-only';
import { mediaJobId, QUEUE_NAMES, type MediaJobData, type MediaJobName } from '@sahar/shared';
import { Queue } from 'bullmq';
import { getServerEnv } from './env';

const globalForQueue = globalThis as unknown as { __saharMediaQueue?: Queue<MediaJobData> };

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
