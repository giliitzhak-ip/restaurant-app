import { Queue } from "bullmq";
import IORedis from "ioredis";

export const MEDIA_QUEUE = "media";
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
