import { Queue } from "bullmq";
import IORedis from "ioredis";

export const MEDIA_QUEUE = "media";
export const AI_QUEUE = "ai";
export const WORKER_HEARTBEAT_KEY = "worker:media:heartbeat";

export type MediaJobData = { jobId: string };

/** BullMQ requires maxRetriesPerRequest=null on its connections. */
export function bullConnection() {
  const conn = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  conn.on("error", () => {});
  return conn;
}

const g = globalThis as unknown as { mediaQueue?: Queue<MediaJobData> };

export function mediaQueue(): Queue<MediaJobData> {
  g.mediaQueue ??= new Queue<MediaJobData>(MEDIA_QUEUE, {
    connection: bullConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return g.mediaQueue;
}

/** Enqueue by our Job id (idempotent: BullMQ ignores a duplicate jobId). */
export async function enqueueMediaJob(jobId: string): Promise<boolean> {
  try {
    await Promise.race([
      mediaQueue().add("process", { jobId }, { jobId }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("enqueue timeout")), 5000)),
    ]);
    return true;
  } catch (e) {
    // The Job row stays QUEUED; the worker re-enqueues pending rows on startup.
    console.error("enqueue failed", jobId, e);
    return false;
  }
}

const gAi = globalThis as unknown as { aiQueue?: Queue<MediaJobData> };

/**
 * AI jobs (face swap…). Retries only re-run polling: the adapter's start() is
 * guarded by the persisted providerJobId, so a paid job is never submitted twice.
 */
export function aiQueue(): Queue<MediaJobData> {
  gAi.aiQueue ??= new Queue<MediaJobData>(AI_QUEUE, {
    connection: bullConnection(),
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 15_000 },
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });
  return gAi.aiQueue;
}

export async function enqueueAiJob(jobId: string): Promise<boolean> {
  try {
    await Promise.race([
      aiQueue().add("run", { jobId }, { jobId }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("enqueue timeout")), 5000)),
    ]);
    return true;
  } catch (e) {
    console.error("ai enqueue failed", jobId, e);
    return false;
  }
}
