import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Asset, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { keys, storage } from "@/server/storage";
import { ffprobe } from "@/server/media/probe";
import { runFfmpeg } from "@/server/media/ffmpeg";
import { enqueueMediaJob } from "@/server/queue";
import type { FacesResult } from "@/server/media/faces";
import { getFaceSwapProvider } from "@/providers/face-swap";
import { fullClip, type FaceSelection, type ProviderMedia, type PollResult } from "@/providers/face-swap/types";
import { providerAccount, type FaceSwapInput, type QuoteDTO } from "@/server/face-swap";
import { coveredByFreeCredits, freeMode } from "@/server/billing";

/** Not worth retrying (bad input, provider refused, not approved…). */
export class JobFailed extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

const MAX_WAIT_MS = Number(process.env.AI_JOB_TIMEOUT_MIN || 60) * 60_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function media(asset: Asset, localPath: string): ProviderMedia {
  return { localPath, mimeType: asset.mimeType, url: () => storage().signedUrl(asset.storageKey, 6 * 3600) };
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  let size = 0;
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).on("data", (c: Buffer) => {
    size += c.length;
    if (size > MAX_OUTPUT_BYTES) body.destroy(new Error("output too large"));
  });
  await pipeline(body, createWriteStream(dest));
}

/**
 * Runs an approved FACE_SWAP job end-to-end. Safe to retry: the provider is
 * only called with start() when no providerJobId has been recorded yet.
 */
export async function processFaceSwap(jobId: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || !["QUEUED", "RUNNING"].includes(job.status)) return;
  if (!job.approvedAt || job.approvedCostCents === null) throw new JobFailed("המשימה לא אושרה לחיוב", "NOT_APPROVED");

  const provider = getFaceSwapProvider(job.provider);
  if (!provider) throw new JobFailed("ספק החלפת הפנים אינו זמין עוד", "PROVIDER_UNKNOWN");
  const quote = job.quote as unknown as QuoteDTO | null;
  if (!job.providerJobId && provider.paid) {
    if (freeMode()) {
      // Free Mode: last check right before the provider call. Only a free, subscription-less
      // account with enough remaining credits may be used; otherwise nothing is sent.
      if (!quote?.freeCredits) throw new JobFailed("מצב חינמי פעיל: המשימה אושרה כמשימה בתשלום ולכן לא נשלחה. לא בוצע חיוב.", "FREE_MODE");
      const { account } = await providerAccount(provider, true);
      const check = coveredByFreeCredits(account, quote.estimate.credits);
      if (!check.ok) throw new JobFailed(`מצב חינמי: ${check.reason} לא נשלחה משימה ולא בוצע חיוב.`, "FREE_MODE");
    } else if (process.env.ALLOW_PAID_PROVIDERS !== "true") {
      throw new JobFailed("שירותים בתשלום הושבתו בשרת לפני תחילת העיבוד. לא בוצע חיוב.", "PAID_DISABLED");
    }
  }

  const input = job.input as unknown as FaceSwapInput;
  const clipOf = (durationMs: number | null) => input.clip ?? fullClip({ durationSec: (durationMs ?? 0) / 1000, width: 0, height: 0, fps: null, hasAudio: false });
  const [source, target] = await Promise.all([
    db.asset.findUnique({ where: { id: input.sourceAssetId } }),
    db.asset.findUnique({ where: { id: input.targetAssetId } }),
  ]);
  if (!source || !target) throw new JobFailed("קבצי המקור נמחקו לפני העיבוד", "INPUT_DELETED");

  let lastProgress = -1;
  const setProgress = async (p: number) => {
    const v = Math.max(1, Math.min(99, Math.round(p)));
    if (v === lastProgress) return;
    lastProgress = v;
    await db.job.update({ where: { id: jobId }, data: { progress: v } }).catch(() => {});
  };

  if (job.status === "QUEUED") await db.job.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date(), progress: 2 } });
  const startedAt = job.startedAt ?? new Date();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sahar-ai-"));
  try {
    const srcPath = path.join(tmp, `source${path.extname(source.storageKey)}`);
    const tgtPath = path.join(tmp, `target${path.extname(target.storageKey)}`);
    await Promise.all([storage().downloadToFile(source.storageKey, srcPath), storage().downloadToFile(target.storageKey, tgtPath)]);

    let providerJobId = job.providerJobId;
    if (!providerJobId) {
      const faces = target.faces as FacesResult | null;
      const person = faces?.status === "ok" && input.personIndex !== null ? faces.persons.find((p) => p.index === input.personIndex) : undefined;
      let selection: FaceSelection | null = null;
      if (person && faces?.status === "ok") {
        const thumbKey = keys.asset(target.ownerId, target.projectId, target.id, `faces/${person.thumb}`);
        const thumbPath = path.join(tmp, person.thumb);
        await storage().downloadToFile(thumbKey, thumbPath).catch(() => {});
        selection = {
          personIndex: person.index,
          box: person.box,
          timeSec: person.bestTime,
          personsInVideo: faces.persons.length,
          thumb: { localPath: thumbPath, mimeType: "image/jpeg", url: () => storage().signedUrl(thumbKey, 6 * 3600) },
        };
      }
      await setProgress(5);
      // The one call that can cost money. Record its id immediately.
      let started;
      try {
        started = await provider.start(
          {
            jobId,
            sourceImage: media(source, srcPath),
            targetVideo: media(target, tgtPath),
            video: {
              durationSec: (target.durationMs ?? 0) / 1000,
              width: target.width ?? 0,
              height: target.height ?? 0,
              fps: target.fps,
              hasAudio: Boolean(target.hasAudio),
            },
            clip: clipOf(target.durationMs),
            target: selection,
          },
          { onProgress: (f) => void setProgress(5 + f * 80) },
        );
      } catch (e) {
        // Never auto-retry a submission: we can't know whether the provider accepted (and billed) it.
        console.error(`[ai] start failed for ${jobId}:`, (e as Error).message);
        throw new JobFailed("שליחת המשימה לספק נכשלה. לא ידוע אם בוצע חיוב, בדקו בלוח הבקרה של הספק לפני ניסיון חוזר.", "START_FAILED");
      }
      providerJobId = started.providerJobId;
      await db.job.update({ where: { id: jobId }, data: { providerJobId } });
      await db.projectEvent.create({
        data: { projectId: job.projectId, userId: job.userId, type: "faceswap.submitted", message: `המשימה נשלחה לעיבוד אצל ${provider.displayName}`, data: { jobId } },
      });
    }

    // Poll with backoff until the provider finishes.
    let result: PollResult = { state: "running" };
    for (let i = 0; ; i++) {
      result = await provider.poll(providerJobId, { onProgress: () => {} });
      if (result.state !== "running") break;
      if (result.progress !== undefined) await setProgress(10 + result.progress * 80);
      if (Date.now() - startedAt.getTime() > MAX_WAIT_MS) {
        throw new JobFailed(`הספק לא סיים תוך ${MAX_WAIT_MS / 60_000} דקות. מזהה המשימה אצל הספק: ${providerJobId}`, "PROVIDER_TIMEOUT");
      }
      await sleep(Math.min(15_000, 3000 + i * 1000));
    }
    if (result.state === "failed") throw new JobFailed(`הספק דיווח על כישלון: ${result.message}`, result.code ?? "PROVIDER_FAILED");

    await setProgress(90);
    const raw = path.join(tmp, "result-raw.mp4");
    if (result.output.kind === "url") await download(result.output.url, raw);
    else await fs.copyFile(result.output.path, raw);

    // Keep the original soundtrack if the provider dropped it; stamp AI metadata.
    const probe = await ffprobe(raw);
    if (!probe?.streams?.some((s) => s.codec_type === "video")) throw new JobFailed("הספק החזיר קובץ שאינו סרטון תקין", "BAD_OUTPUT");
    const outHasAudio = probe.streams.some((s) => s.codec_type === "audio");
    const final = path.join(tmp, "result.mp4");
    const label = `AI-generated (face swap, ${provider.displayName}) by SAHAR FACE MOTION AI. Not an authentic recording.`;
    const restoreAudio = !outHasAudio && Boolean(target.hasAudio);
    const clip = clipOf(target.durationMs);
    await runFfmpeg([
      "-i", raw,
      ...(restoreAudio
        ? ["-ss", clip.startSec.toFixed(3), "-t", (clip.endSec - clip.startSec).toFixed(3), "-i", tgtPath, "-map", "0:v:0", "-map", "1:a:0", "-shortest"]
        : ["-map", "0"]),
      "-c:v", "copy",
      ...(restoreAudio ? ["-c:a", "aac", "-b:a", "160k"] : ["-c:a", "copy"]),
      "-metadata", `comment=${label}`, "-metadata", "description=AI-generated synthetic media",
      "-movflags", "+faststart",
      final,
    ]);
    await setProgress(95);

    const assetId = randomUUID();
    const storageKey = keys.asset(job.userId, job.projectId, assetId, "original.mp4");
    await storage().putFile(storageKey, final, "video/mp4");
    const { size } = await fs.stat(final);
    // Free-credit jobs cost $0 by construction; otherwise prefer what the provider reports.
    const costCents = quote?.freeCredits ? 0 : (result.billedCents ?? job.approvedCostCents);
    const creditsUsed = result.billedCredits ?? quote?.estimate.credits;
    const baseName = (target.originalName ?? "video").replace(/\.[^.]+$/, "");

    const probeJob = await db.$transaction(async (tx) => {
      await tx.asset.create({
        data: {
          id: assetId,
          projectId: job.projectId,
          ownerId: job.userId,
          kind: "VIDEO",
          role: "GENERATED",
          status: "PROCESSING",
          aiGenerated: true,
          storageKey,
          mimeType: "video/mp4",
          sizeBytes: BigInt(size),
          originalName: `${baseName}-face-swap.mp4`,
          consentId: input.faceConsentId,
          producedByJobId: jobId,
        },
      });
      const pj = await tx.job.create({ data: { projectId: job.projectId, userId: job.userId, type: "MEDIA_PROBE", provider: "ffmpeg", input: { assetId } } });
      await tx.job.update({
        where: { id: jobId },
        data: { status: "SUCCEEDED", progress: 100, finishedAt: new Date(), actualCostCents: costCents, output: { assetId } as Prisma.InputJsonValue },
      });
      await tx.usageRecord.create({
        data: creditsUsed !== undefined
          ? { userId: job.userId, jobId, provider: provider.id, unit: quote?.freeCredits ? "free_credits" : "credits", quantity: creditsUsed, costCents }
          : { userId: job.userId, jobId, provider: provider.id, unit: "video_seconds", quantity: clip.endSec - clip.startSec, costCents },
      });
      await tx.projectEvent.create({
        data: {
          projectId: job.projectId,
          userId: job.userId,
          type: "faceswap.succeeded",
          message: `החלפת הפנים הושלמה (${provider.displayName}${costCents ? `, עלות $${(costCents / 100).toFixed(2)}` : quote?.freeCredits && creditsUsed ? `, ${creditsUsed} קרדיטים חינמיים` : ""}). התוצאה מסומנת כתוכן AI.`,
          data: { jobId, assetId },
        },
      });
      return pj;
    });
    await enqueueMediaJob(probeJob.id);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

export async function failAiJob(jobId: string, message: string, code: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || ["SUCCEEDED", "CANCELED"].includes(job.status)) return;
  await db.job.update({ where: { id: jobId }, data: { status: "FAILED", errorCode: code, errorMessage: message, finishedAt: new Date() } });
  await db.projectEvent.create({
    data: { projectId: job.projectId, userId: job.userId, type: "faceswap.failed", message: `החלפת הפנים נכשלה: ${message}`, data: { jobId } },
  });
}
