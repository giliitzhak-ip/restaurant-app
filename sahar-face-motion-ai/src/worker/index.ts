import { UnrecoverableError, Worker } from "bullmq";
import { db } from "@/lib/db";
import { AI_QUEUE, bullConnection, enqueueAiJob, enqueueMediaJob, MEDIA_QUEUE, WORKER_HEARTBEAT_KEY, type MediaJobData } from "@/server/queue";
import { failMediaProbe, MediaRejected, processMediaProbe } from "./media-job";
import { failAiJob, JobFailed, processFaceSwap } from "./ai-job";

const CONCURRENCY = Number(process.env.MEDIA_WORKER_CONCURRENCY) || 2;

const worker = new Worker<MediaJobData>(
  MEDIA_QUEUE,
  async (job) => {
    try {
      await processMediaProbe(job.data.jobId);
    } catch (e) {
      if (e instanceof MediaRejected) throw new UnrecoverableError(e.message);
      throw e;
    }
  },
  { connection: bullConnection(), concurrency: CONCURRENCY, lockDuration: 120_000 },
);

worker.on("failed", async (job, err) => {
  if (!job) return;
  const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
  console.error(`[media] job ${job.data.jobId} failed (attempt ${job.attemptsMade}${final ? ", final" : ""}):`, err.message);
  if (final) {
    const rejected = err instanceof UnrecoverableError;
    await failMediaProbe(
      job.data.jobId,
      rejected ? err.message : "אירעה שגיאה בעיבוד הקובץ. נסו להעלות אותו שוב.",
      rejected ? "INVALID_MEDIA" : "PROCESSING_ERROR",
    ).catch((e) => console.error("failMediaProbe", e));
  }
});
worker.on("completed", (job) => console.log(`[media] job ${job.data.jobId} done`));

// AI jobs: long-running provider calls (mostly waiting on the vendor).
const aiWorker = new Worker<MediaJobData>(
  AI_QUEUE,
  async (job) => {
    try {
      await processFaceSwap(job.data.jobId);
    } catch (e) {
      if (e instanceof JobFailed) {
        await failAiJob(job.data.jobId, e.message, e.code);
        throw new UnrecoverableError(e.message);
      }
      throw e; // transient (network, 5xx): BullMQ retries; polling resumes from the saved providerJobId
    }
  },
  { connection: bullConnection(), concurrency: Number(process.env.AI_WORKER_CONCURRENCY) || 3, lockDuration: 300_000 },
);
aiWorker.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`[ai] job ${job.data.jobId} failed (attempt ${job.attemptsMade}):`, err.message);
  if (!(err instanceof UnrecoverableError) && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await failAiJob(job.data.jobId, "העיבוד נכשל שוב ושוב בגלל תקלה זמנית. נסו שוב מאוחר יותר.", "TRANSIENT_FAILURES").catch(() => {});
  }
});
aiWorker.on("completed", (job) => console.log(`[ai] job ${job.data.jobId} done`));

// Heartbeat so the web app can show whether a worker is alive.
const hb = bullConnection();
const beat = () => hb.set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", 30).catch(() => {});
void beat();
const beatTimer = setInterval(beat, 10_000);

// Recovery: re-enqueue jobs whose Redis entry was lost (e.g. Redis restarted, or enqueue failed at upload).
async function recover() {
  const pending = await db.job.findMany({
    where: { type: "MEDIA_PROBE", status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: new Date(Date.now() - 30_000) } },
    select: { id: true },
    take: 500,
  });
  for (const j of pending) await enqueueMediaJob(j.id);
  if (pending.length) console.log(`[media] re-enqueued ${pending.length} pending job(s)`);
  // Approved AI jobs whose queue entry was lost. Safe: start() is skipped when providerJobId exists.
  const ai = await db.job.findMany({
    where: { type: "FACE_SWAP", status: { in: ["QUEUED", "RUNNING"] }, approvedAt: { not: null }, createdAt: { lt: new Date(Date.now() - 30_000) } },
    select: { id: true },
    take: 200,
  });
  for (const j of ai) await enqueueAiJob(j.id);
}
void recover();
const recoverTimer = setInterval(() => void recover(), 5 * 60_000);

console.log(`[media] worker started (concurrency ${CONCURRENCY})`);

async function shutdown() {
  clearInterval(beatTimer);
  clearInterval(recoverTimer);
  await Promise.all([worker.close(), aiWorker.close()]);
  await hb.quit().catch(() => {});
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
