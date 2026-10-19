import { UnrecoverableError, Worker } from "bullmq";
import { db } from "@/lib/db";
import { bullConnection, enqueueMediaJob, MEDIA_QUEUE, WORKER_HEARTBEAT_KEY, type MediaJobData } from "@/server/queue";
import { failMediaProbe, MediaRejected, processMediaProbe } from "./media-job";

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
}
void recover();
const recoverTimer = setInterval(() => void recover(), 5 * 60_000);

console.log(`[media] worker started (concurrency ${CONCURRENCY})`);

async function shutdown() {
  clearInterval(beatTimer);
  clearInterval(recoverTimer);
  await worker.close();
  await hb.quit().catch(() => {});
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
