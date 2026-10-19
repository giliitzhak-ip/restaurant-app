import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { classifyUpload, formatBytes, mediaLimits } from "@/server/media/policy";
import { keys, storage } from "@/server/storage";
import { enqueueMediaJob } from "@/server/queue";
import { toAssetDTO } from "@/server/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

class TooLarge extends Error {}

const TOO_LARGE = { IMAGE: "התמונה גדולה מדי.", VIDEO: "הסרטון גדול מדי.", AUDIO: "קובץ האודיו גדול מדי." } as const;

/**
 * Raw-body upload: the browser PUTs/POSTs the file bytes with
 * `X-File-Name` (URI-encoded). We stream to a temp file (hashing and
 * enforcing the size limit on the fly), store it, then queue FFprobe
 * validation and preview generation in the media worker.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;
  const { id: projectId } = await params;

  const project = await db.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { id: true } });
  if (!project) return jsonError("הפרויקט לא נמצא", 404);

  const rl = await rateLimit(`upload:${userId}`, 100, 3600);
  if (!rl.allowed) return jsonError("הגעתם למגבלת ההעלאות לשעה. נסו שוב מאוחר יותר.", 429);

  let fileName = "file";
  try {
    fileName = decodeURIComponent(req.headers.get("x-file-name") ?? "file").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200) || "file";
  } catch {
    return jsonError("שם הקובץ אינו תקין", 400);
  }
  const type = classifyUpload(fileName, req.headers.get("content-type"));
  if (!type.ok) return jsonError(type.error, 415);

  const limits = mediaLimits();
  const maxBytes = limits.maxBytes[type.kind];
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return jsonError(`${TOO_LARGE[type.kind]} הגודל המרבי הוא ${formatBytes(maxBytes)}.`, 413);
  }

  const used = await db.asset.aggregate({ where: { ownerId: userId }, _sum: { sizeBytes: true } });
  const usedBytes = Number(used._sum.sizeBytes ?? 0);
  if (usedBytes + (Number.isFinite(declared) ? declared : 0) > limits.maxStorageBytesPerUser) {
    return jsonError(`נגמר נפח האחסון שלכם (${formatBytes(limits.maxStorageBytesPerUser)}). מחקו קבצים או פרויקטים כדי לפנות מקום.`, 413);
  }
  if (!req.body) return jsonError("לא התקבל קובץ", 400);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sahar-upload-"));
  const tmpFile = path.join(tmpDir, `upload.${type.ext}`);
  const hash = createHash("sha256");
  let size = 0;
  try {
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (size > maxBytes) return cb(new TooLarge());
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), meter, createWriteStream(tmpFile));
    if (size === 0) return jsonError("הקובץ ריק", 400);
    if (usedBytes + size > limits.maxStorageBytesPerUser) {
      return jsonError(`נגמר נפח האחסון שלכם (${formatBytes(limits.maxStorageBytesPerUser)}).`, 413);
    }

    const assetId = randomUUID();
    const storageKey = keys.asset(userId, projectId, assetId, `original.${type.ext}`);
    await storage().putFile(storageKey, tmpFile, type.mime);

    let jobId: string;
    try {
      const [asset, job] = await db.$transaction([
        db.asset.create({
          data: {
            id: assetId,
            projectId,
            ownerId: userId,
            kind: type.kind,
            role: "SOURCE",
            status: "PROCESSING",
            storageKey,
            mimeType: type.mime,
            sizeBytes: BigInt(size),
            originalName: fileName,
            checksumSha256: hash.digest("hex"),
          },
        }),
        db.job.create({
          data: { projectId, userId, type: "MEDIA_PROBE", provider: "ffmpeg", input: { assetId } },
        }),
        db.projectEvent.create({
          data: { projectId, userId, type: "asset.uploaded", message: `הועלה קובץ: ${fileName} (${formatBytes(size)})`, data: { assetId } },
        }),
        db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } }),
      ]);
      jobId = job.id;
      const queued = await enqueueMediaJob(jobId);
      return NextResponse.json({ ok: true, asset: toAssetDTO(asset, { status: "QUEUED", progress: 0 }), queued }, { status: 201 });
    } catch (e) {
      await storage().delete(storageKey).catch(() => {});
      throw e;
    }
  } catch (e) {
    if (e instanceof TooLarge) return jsonError(`${TOO_LARGE[type.kind]} הגודל המרבי הוא ${formatBytes(maxBytes)}.`, 413);
    console.error("upload failed", e);
    return jsonError("ההעלאה נכשלה. בדקו את החיבור ונסו שוב.", 500);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
