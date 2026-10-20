import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { runFfmpeg, scaleShortSide } from "@/server/media/ffmpeg";
import { matchFace } from "@/server/media/faces";
import { providerFetch, ProviderHttpError } from "./http";
import type { FaceSwapProvider, PollResult, ProviderAccount, VideoInfo } from "./types";

/**
 * Magic Hour face swap (https://magichour.ai).
 *
 * Every endpoint and field below is taken from the official SDK documentation
 * (github.com/magichourhq/magic-hour-python, resources/v1/<module>/README.md):
 *   POST /v1/files/upload-urls   {items:[{extension,type}]} → {items:[{upload_url,file_path,expires_at}]}, then PUT the bytes
 *   POST /v1/face-detection      {assets:{target_file_path}, confidence_score} → {id}   (free)
 *   GET  /v1/face-detection/{id} → {status, faces:[{path,url}]}
 *   POST /v1/face-swap           {start_seconds,end_seconds,name,style:{version},assets:{video_source:"file",video_file_path,
 *                                  face_swap_mode:"all-faces"|"individual-faces",image_file_path | face_mappings:[{original_face,new_face}]}}
 *                                 → {id, credits_charged, estimated_frame_cost}
 *   GET  /v1/video-projects/{id} → {status: queued|rendering|complete|error|canceled, downloads:[{url}], credits_charged, error}
 *   GET  /v1/account             → {credits, tier: free|creator|pro|business, subscription: {...}|null}
 * Auth: Authorization: Bearer <MAGIC_HOUR_API_KEY>.
 */

const BASE = () => (process.env.MAGIC_HOUR_BASE_URL || "https://api.magichour.ai").replace(/\/+$/, "");
const auth = () => ({ Authorization: `Bearer ${process.env.MAGIC_HOUR_API_KEY}` });

// Pricing: 1 credit per rendered frame (Magic Hour product page/FAQ). The USD price
// of a credit depends on the purchased plan, so it is configurable; the default is
// the upper end of published plans so the estimate errs on the high side.
export const MAGIC_HOUR_PRICING = {
  creditsPerFrame: () => Number(process.env.MAGIC_HOUR_CREDITS_PER_FRAME) || 1,
  usdPerCredit: () => Number(process.env.MAGIC_HOUR_USD_PER_CREDIT) || 0.0025,
  /** We send at most 30 fps (iPhone 60 fps clips would otherwise cost double). */
  maxFps: 30,
};

/** Frames that will be rendered for this clip after our ≤30 fps normalisation. */
export function magicHourFrames(v: VideoInfo) {
  const fps = Math.min(MAGIC_HOUR_PRICING.maxFps, v.fps && v.fps > 0 ? v.fps : 30);
  return Math.ceil(v.durationSec * fps);
}

type UploadUrls = { items: { upload_url: string; file_path: string; expires_at: string }[] };
type Detection = { id: string; status?: string; faces?: { path: string; url: string }[] };

async function putFile(url: string, file: string, contentType: string) {
  const { size } = await fs.stat(file);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(size) },
    body: Readable.toWeb(createReadStream(file)) as ReadableStream,
    duplex: "half",
  } as RequestInit);
  if (!res.ok) throw new ProviderHttpError(`upload failed: HTTP ${res.status}`, res.status, res.status >= 500);
}

export const magicHourFaceSwap: FaceSwapProvider = {
  id: "magichour",
  displayName: "Magic Hour",
  paid: true,
  requiredEnv: ["MAGIC_HOUR_API_KEY"],
  capabilities: {
    maxDurationSec: Number(process.env.MAGIC_HOUR_MAX_SECONDS) || 180,
    minDurationSec: 1,
    maxOutputShortSide: 1080,
    maxInputBytes: 500 * 1024 * 1024,
    faceSelection: "reference-image",
    keepsAudio: true,
    needsPublicUrls: false, // files are uploaded through Magic Hour's own upload URLs
  },
  notes: [
    "חיוב לפי פריים מעובד (קרדיט לפריים). אנחנו שולחים לכל היותר 30 פריימים לשנייה כדי לא לשלם כפול על סרטוני 60fps.",
    "רזולוציית הפלט תלויה בתוכנית שנרכשה (1080p בתוכניות בתשלום; 576px בחינמית).",
    "שימוש מסחרי מותר בתוכניות בתשלום. אסור ליצור תוכן מטעה, תוכן ללא הסכמה או התחזות.",
    "הקבצים נמחקים אצל הספק לאחר תקופה קצרה, והתוצאה נשמרת אצלנו.",
  ],

  estimate(video) {
    const frames = magicHourFrames(video);
    const credits = frames * MAGIC_HOUR_PRICING.creditsPerFrame();
    const costCents = Math.ceil(credits * MAGIC_HOUR_PRICING.usdPerCredit() * 100);
    return {
      costCents,
      credits,
      basis: `${credits.toLocaleString("he-IL")} קרדיטים × $${MAGIC_HOUR_PRICING.usdPerCredit()} לקרדיט (הערכה עליונה; החיוב בפועל לפי הפריימים שעובדו)`,
      breakdown: [
        { label: "אורך הסרטון", value: `${video.durationSec.toFixed(1)} שניות` },
        { label: "פריימים לעיבוד", value: `${frames.toLocaleString("he-IL")} (${Math.round(Math.min(30, video.fps ?? 30))}fps)` },
        { label: "קרדיטים", value: credits.toLocaleString("he-IL") },
        { label: "מחיר לקרדיט", value: `$${MAGIC_HOUR_PRICING.usdPerCredit()}` },
      ],
      source: "https://magichour.ai/pricing",
      verifiedAt: "2026-10-19",
    };
  },

  async account(): Promise<ProviderAccount> {
    const a = await providerFetch<{ credits: number; tier: string; subscription?: { name?: string } | null }>(`${BASE()}/v1/account`, { headers: auth(), timeoutMs: 15_000 });
    return { credits: Number(a.credits) || 0, tier: a.tier, subscription: a.subscription ? (a.subscription.name ?? "subscription") : null };
  },

  async start(req, ctx) {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "sahar-mh-"));
    const clipDur = Math.max(0.1, req.clip.endSec - req.clip.startSec);
    try {
      // 1. Normalise the clip: trim, H.264, ≤ chosen fps, short side ≤1080, audio kept. Also makes iPhone HEVC safe.
      const video = path.join(work, "target.mp4");
      await runFfmpeg(
        ["-ss", req.clip.startSec.toFixed(3), "-t", clipDur.toFixed(3), "-i", req.targetVideo.localPath, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scaleShortSide(1080), "-fpsmax", String(req.clip.maxFps),
          "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", video],
        { durationSec: clipDur, onProgress: (f) => ctx.onProgress(f * 0.3) },
      );
      const imgExt = path.extname(req.sourceImage.localPath).slice(1).toLowerCase() || "jpg";

      // 2. Upload both inputs to Magic Hour storage.
      const urls = await providerFetch<UploadUrls>(`${BASE()}/v1/files/upload-urls`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ extension: "mp4", type: "video" }, { extension: imgExt === "jpeg" ? "jpg" : imgExt, type: "image" }] }),
      });
      const [vid, img] = urls.items;
      if (!vid?.upload_url || !img?.upload_url) throw new Error("Magic Hour did not return upload URLs");
      await putFile(vid.upload_url, video, "video/mp4");
      await putFile(img.upload_url, req.sourceImage.localPath, req.sourceImage.mimeType);
      ctx.onProgress(0.6);

      // 3. Several people in the clip and the user chose one: map that person via Magic Hour's own (free) detection.
      let assets: Record<string, unknown> = { video_source: "file", video_file_path: vid.file_path, face_swap_mode: "all-faces", image_file_path: img.file_path };
      if (req.target && req.target.personsInVideo > 1 && req.target.thumb) {
        const created = await providerFetch<Detection>(`${BASE()}/v1/face-detection`, {
          method: "POST",
          headers: { ...auth(), "Content-Type": "application/json" },
          body: JSON.stringify({ assets: { target_file_path: vid.file_path }, confidence_score: 0.5 }),
        });
        let det: Detection = created;
        for (let i = 0; i < 60 && det.status !== "complete"; i++) {
          if (det.status === "error") throw new Error("Magic Hour face detection failed");
          await new Promise((r) => setTimeout(r, 2000));
          det = await providerFetch<Detection>(`${BASE()}/v1/face-detection/${encodeURIComponent(created.id)}`, { headers: auth() });
        }
        const faces = det.faces ?? [];
        if (det.status !== "complete" || faces.length === 0) throw new Error("Magic Hour did not detect faces in the video");
        const files: string[] = [];
        for (const [i, f] of faces.entries()) {
          const res = await fetch(f.url);
          if (!res.ok) throw new Error(`face thumbnail download failed: HTTP ${res.status}`);
          const file = path.join(work, `mh-face-${i}.png`);
          await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
          files.push(file);
        }
        const match = await matchFace(req.target.thumb.localPath, files);
        if (match.best === null) {
          throw new Error("לא ניתן היה לזהות בוודאות את האדם שנבחר בזיהוי של הספק. לא נשלחה משימה ולא בוצע חיוב.");
        }
        assets = {
          video_source: "file",
          video_file_path: vid.file_path,
          face_swap_mode: "individual-faces",
          face_mappings: [{ original_face: faces[match.best]!.path, new_face: img.file_path }],
        };
      }
      ctx.onProgress(0.8);

      // 4. The billable call.
      const job = await providerFetch<{ id: string; credits_charged?: number; estimated_frame_cost?: number }>(`${BASE()}/v1/face-swap`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `SAHAR ${req.jobId}`,
          start_seconds: 0,
          end_seconds: Math.round(clipDur * 1000) / 1000,
          style: { version: process.env.MAGIC_HOUR_STYLE_VERSION || "default" },
          assets,
        }),
      });
      if (!job.id) throw new Error("Magic Hour did not return a project id");
      ctx.onProgress(1);
      return { providerJobId: job.id };
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  },

  async poll(id): Promise<PollResult> {
    const p = await providerFetch<{
      status: string;
      downloads?: { url: string }[];
      download?: { url: string } | null;
      credits_charged?: number;
      error?: { code?: string; message?: string } | null;
    }>(`${BASE()}/v1/video-projects/${encodeURIComponent(id)}`, { headers: auth() });
    if (p.status === "complete") {
      const url = p.downloads?.[0]?.url ?? p.download?.url;
      if (!url) return { state: "failed", message: "הספק סיים אך לא החזיר קובץ", code: "NO_DOWNLOAD" };
      const billedCents = p.credits_charged !== undefined ? Math.ceil(p.credits_charged * MAGIC_HOUR_PRICING.usdPerCredit() * 100) : undefined;
      return { state: "succeeded", output: { kind: "url", url }, billedCents, billedCredits: p.credits_charged };
    }
    if (p.status === "error" || p.status === "canceled") {
      const code = p.error?.code;
      const message =
        code === "no_source_face" ? "הספק לא זיהה פנים בתמונת המקור. בחרו תמונה ברורה של הפנים." : p.error?.message || (p.status === "canceled" ? "המשימה בוטלה אצל הספק" : "שגיאה אצל הספק");
      return { state: "failed", message, code: code ?? p.status };
    }
    return { state: "running" };
  },
};
