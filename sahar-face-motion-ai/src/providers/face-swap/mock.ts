import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "@/server/media/ffmpeg";
import type { FaceSwapProvider, PollResult } from "./types";

const OUT_DIR = path.join(os.tmpdir(), "sahar-mock-faceswap");

/**
 * Free local test provider. It does NOT swap faces: it renders the target video
 * with the source photo pinned over the chosen face's position and a large
 * "TEST" banner, so the whole pipeline (selection, approval, job tracking,
 * storage, before/after, download) can be exercised without a paid API.
 */
export const mockFaceSwap: FaceSwapProvider = {
  id: "mock",
  displayName: "Mock (בדיקות, ללא AI)",
  paid: false,
  requiredEnv: [],
  capabilities: {
    maxDurationSec: 180,
    minDurationSec: 0.3,
    maxOutputShortSide: 1080,
    maxInputBytes: 500 * 1024 * 1024,
    faceSelection: "box",
    keepsAudio: true,
    needsPublicUrls: false,
  },
  notes: ["ספק בדיקות מקומי: לא מתבצעת החלפת פנים אמיתית. התוצאה מסומנת TEST ומשמשת לבדיקת התהליך בלבד."],

  estimate(video) {
    return {
      costCents: 0,
      basis: "ספק בדיקות מקומי, ללא עלות",
      breakdown: [
        { label: "אורך", value: `${video.durationSec.toFixed(1)} שניות` },
        { label: "עלות", value: "$0.00" },
      ],
      source: "local",
      verifiedAt: "2026-10-19",
    };
  },

  async start(req, ctx) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    const out = path.join(OUT_DIR, `${req.jobId}.mp4`);
    const box = req.target?.box ?? { x: 0.4, y: 0.15, w: 0.2, h: 0.25 };
    // Overlay the photo where the selected face is (at its detected position), plus a banner.
    const filter = [
      `[1:v]scale=w='trunc(${Math.max(16, Math.round(req.video.width * box.w * 1.3))}/2)*2':h=-2,format=yuva420p,colorchannelmixer=aa=0.85[face]`,
      `[0:v][face]overlay=x='main_w*${(box.x - box.w * 0.15).toFixed(4)}':y='main_h*${(box.y - box.h * 0.15).toFixed(4)}'[v1]`,
      `[v1]drawbox=x=0:y=0:w=iw:h=ih*0.09:color=black@0.6:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='TEST OUTPUT - NOT A REAL FACE SWAP':fontcolor=0xD4AF37:fontsize=h*0.04:x=(w-tw)/2:y=h*0.025,format=yuv420p[v]`,
    ].join(";");
    await runFfmpeg(
      [
        "-i", req.targetVideo.localPath,
        "-i", req.sourceImage.localPath,
        "-filter_complex", filter,
        "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        out,
      ],
      { durationSec: req.video.durationSec, onProgress: ctx.onProgress },
    );
    return { providerJobId: `mock-${req.jobId}` };
  },

  async poll(providerJobId): Promise<PollResult> {
    const file = path.join(OUT_DIR, `${providerJobId.replace(/^mock-/, "")}.mp4`);
    try {
      await fs.access(file);
      return { state: "succeeded", output: { kind: "file", path: file }, billedCents: 0 };
    } catch {
      return { state: "failed", message: "קובץ התוצאה של ספק הבדיקות לא נמצא", code: "MOCK_OUTPUT_MISSING" };
    }
  },
};
