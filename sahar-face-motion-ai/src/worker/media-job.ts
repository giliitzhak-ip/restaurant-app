import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { keys, storage } from "@/server/storage";
import { analyzeProbe, ffprobe } from "@/server/media/probe";
import { mediaLimits, type MediaKind } from "@/server/media/policy";
import { detectFaces, type FacesResult } from "@/server/media/faces";
import { audioPreviewArgs, imagePreviewArgs, posterArgs, runFfmpeg, videoPreviewArgs } from "@/server/media/ffmpeg";

/** Thrown for invalid user files: not retried, shown to the user. */
export class MediaRejected extends Error {}

type ProbeInput = { assetId: string };

/**
 * MEDIA_PROBE: download the original, validate it with FFprobe, and create
 * browser-friendly derivatives (H.264/AAC MP4 preview, JPEG poster) that
 * play on iPhone Safari and desktop browsers alike.
 */
export async function processMediaProbe(jobId: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.status === "SUCCEEDED" || job.status === "CANCELED") return;
  const { assetId } = job.input as ProbeInput;
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset) {
    await db.job.update({ where: { id: jobId }, data: { status: "CANCELED", finishedAt: new Date() } });
    return; // deleted while queued
  }

  let lastProgress = -1;
  const setProgress = async (p: number) => {
    const v = Math.max(0, Math.min(99, Math.round(p)));
    if (v === lastProgress) return;
    lastProgress = v;
    await db.job.update({ where: { id: jobId }, data: { progress: v } }).catch(() => {});
  };

  await db.job.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date(), progress: 2 } });

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sahar-media-"));
  try {
    const ext = path.extname(asset.storageKey) || "";
    const original = path.join(tmp, `original${ext}`);
    await storage().downloadToFile(asset.storageKey, original);
    await setProgress(10);

    const kind = asset.kind as MediaKind;
    const analysis = analyzeProbe(await ffprobe(original), kind, mediaLimits());
    if (!analysis.ok) throw new MediaRejected(analysis.error);
    const meta = analysis.meta;
    await setProgress(15);

    const k = (file: string) => keys.asset(asset.ownerId, asset.projectId, asset.id, file);
    let previewKey: string | null = null;
    let posterKey: string | null = null;
    let faces: FacesResult | null = null;

    // Find the people in the media for the face-swap picker. Never fails the upload.
    const findFaces = async (input: string) => {
      const outDir = path.join(tmp, "faces");
      const result = await detectFaces({ input, kind: kind as "VIDEO" | "IMAGE", durationSec: (meta.durationMs ?? 0) / 1000, workDir: tmp, outDir }).catch(
        (e): FacesResult => ({ status: "error", reason: (e as Error).message.slice(0, 300) }),
      );
      if (result.status === "ok") {
        for (const p of result.persons) await storage().putFile(k(`faces/${p.thumb}`), path.join(outDir, p.thumb), "image/jpeg");
      } else {
        console.warn(`[media] face detection ${result.status} for ${asset.id}: ${result.reason}`);
      }
      return result;
    };

    if (kind === "VIDEO") {
      const dur = (meta.durationMs ?? 0) / 1000;
      const poster = path.join(tmp, "poster.jpg");
      await runFfmpeg(posterArgs(original, poster, Math.min(1, dur / 2)), { timeoutMs: 60_000 }).catch(() => {
        throw new MediaRejected("לא ניתן לפענח את הסרטון. ייתכן שהקובץ פגום או בקידוד שאינו נתמך.");
      });
      const preview = path.join(tmp, "preview.mp4");
      await runFfmpeg(videoPreviewArgs(original, preview, meta.hasAudio), {
        durationSec: dur,
        onProgress: (f) => void setProgress(20 + f * 65),
      });
      await setProgress(88);
      previewKey = k("preview.mp4");
      posterKey = k("poster.jpg");
      await storage().putFile(previewKey, preview, "video/mp4");
      await storage().putFile(posterKey, poster, "image/jpeg");
      await setProgress(92);
      faces = await findFaces(preview);
    } else if (kind === "IMAGE") {
      const preview = path.join(tmp, "preview.jpg");
      const poster = path.join(tmp, "poster.jpg");
      try {
        await runFfmpeg(imagePreviewArgs(original, preview, 2048), { timeoutMs: 60_000 });
        await runFfmpeg(imagePreviewArgs(original, poster, 640), { timeoutMs: 60_000 });
      } catch {
        throw new MediaRejected(
          ext.toLowerCase() === ".heic" || ext.toLowerCase() === ".heif"
            ? "לא ניתן לעבד את קובץ ה-HEIC. באייפון: הגדרות ← מצלמה ← תבניות ← \"התאמה מרבית\", או העלו את התמונה כ-JPG."
            : "לא ניתן לפענח את התמונה.",
        );
      }
      previewKey = k("preview.jpg");
      posterKey = k("poster.jpg");
      await storage().putFile(previewKey, preview, "image/jpeg");
      await storage().putFile(posterKey, poster, "image/jpeg");
      await setProgress(80);
      faces = await findFaces(preview);
    } else {
      const preview = path.join(tmp, "preview.m4a");
      await runFfmpeg(audioPreviewArgs(original, preview), {
        durationSec: (meta.durationMs ?? 0) / 1000,
        onProgress: (f) => void setProgress(20 + f * 70),
      }).catch(() => {
        throw new MediaRejected("לא ניתן לפענח את קובץ האודיו.");
      });
      previewKey = k("preview.m4a");
      await storage().putFile(previewKey, preview, "audio/mp4");
    }

    // The asset may have been deleted while we were working: don't resurrect it.
    const updated = await db.asset.updateMany({
      where: { id: asset.id },
      data: {
        status: "READY",
        width: meta.width,
        height: meta.height,
        durationMs: meta.durationMs,
        fps: meta.fps,
        hasAudio: meta.hasAudio,
        formatName: meta.formatName,
        videoCodec: meta.videoCodec,
        audioCodec: meta.audioCodec,
        previewKey,
        posterKey,
        ...(faces && { faces: faces as unknown as Prisma.InputJsonValue }),
      },
    });
    if (updated.count === 0) {
      await storage().deletePrefix(keys.asset(asset.ownerId, asset.projectId, asset.id, ""));
      return;
    }
    await db.$transaction([
      db.job.update({
        where: { id: jobId },
        data: { status: "SUCCEEDED", progress: 100, finishedAt: new Date(), output: { ...meta, previewKey, posterKey } as Prisma.InputJsonValue },
      }),
      db.projectEvent.create({
        data: {
          projectId: asset.projectId,
          userId: asset.ownerId,
          type: "asset.ready",
          message: `הקובץ "${asset.originalName ?? "ללא שם"}" עבר בדיקה ומוכן לשימוש`,
          data: { assetId: asset.id },
        },
      }),
    ]);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/** Final failure: mark the asset rejected, remove its stored objects, log to history. */
export async function failMediaProbe(jobId: string, message: string, code: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const { assetId } = job.input as ProbeInput;
  await db.job.update({
    where: { id: jobId },
    data: { status: "FAILED", errorCode: code, errorMessage: message, finishedAt: new Date() },
  });
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset) return;
  await storage()
    .deletePrefix(keys.asset(asset.ownerId, asset.projectId, asset.id, ""))
    .catch((e) => console.error("cleanup failed", e));
  await db.asset.updateMany({ where: { id: asset.id }, data: { status: "REJECTED", errorMessage: message, previewKey: null, posterKey: null } });
  await db.projectEvent.create({
    data: {
      projectId: asset.projectId,
      userId: asset.ownerId,
      type: "asset.rejected",
      message: `הקובץ "${asset.originalName ?? "ללא שם"}" נדחה: ${message}`,
      data: { assetId: asset.id },
    },
  });
}
