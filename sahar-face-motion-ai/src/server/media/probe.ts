import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MediaKind, MediaLimits } from "./policy";

const run = promisify(execFile);

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
  side_data_list?: { side_data_type?: string; rotation?: number }[];
};

export type ProbeResult = {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string; size?: string };
};

export async function ffprobe(filePath: string): Promise<ProbeResult | null> {
  try {
    const { stdout } = await run(
      process.env.FFPROBE_PATH || "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as ProbeResult;
  } catch {
    return null; // not a media file ffprobe can read
  }
}

export type MediaMeta = {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  hasAudio: boolean;
  formatName: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  /** Clockwise rotation the player applies (iPhone portrait videos are stored landscape + rotation). */
  rotation: number;
};

export type Analysis = { ok: true; meta: MediaMeta } | { ok: false; error: string };

const IMAGE_CODECS = new Set(["mjpeg", "png", "webp", "hevc", "av1", "bmp"]);

function parseRate(rate?: string): number | null {
  if (!rate) return null;
  const [n, d] = rate.split("/").map(Number);
  if (!n || !d) return null;
  return Math.round((n / d) * 100) / 100;
}

function rotationOf(s: ProbeStream): number {
  const fromSide = s.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation;
  const raw = fromSide ?? (s.tags?.rotate ? Number(s.tags.rotate) : 0);
  return ((Math.round(raw) % 360) + 360) % 360;
}

/** Pure validation of FFprobe output against what the user claimed to upload. Hebrew errors. */
export function analyzeProbe(probe: ProbeResult | null, kind: MediaKind, limits: MediaLimits): Analysis {
  if (!probe?.streams?.length) {
    return { ok: false, error: "הקובץ פגום או שאינו קובץ מדיה תקין." };
  }
  const video = probe.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = probe.streams.find((s) => s.codec_type === "audio");
  const durationSec = Number(probe.format?.duration ?? video?.duration ?? audio?.duration ?? NaN);
  const formatName = probe.format?.format_name ?? null;

  if (kind === "IMAGE") {
    if (!video || !IMAGE_CODECS.has(video.codec_name ?? "") || !video.width || !video.height) {
      return { ok: false, error: "הקובץ אינו תמונה תקינה." };
    }
    if (video.width < 64 || video.height < 64) return { ok: false, error: "התמונה קטנה מדי (מינימום 64×64 פיקסלים)." };
    if (video.width > 12000 || video.height > 12000) return { ok: false, error: "התמונה גדולה מדי (מקסימום 12000 פיקסלים בצלע)." };
    return {
      ok: true,
      meta: { width: video.width, height: video.height, durationMs: null, fps: null, hasAudio: false, formatName, videoCodec: video.codec_name ?? null, audioCodec: null, rotation: 0 },
    };
  }

  if (kind === "VIDEO") {
    if (!video || !video.width || !video.height) return { ok: false, error: "לא נמצא ערוץ וידאו בקובץ." };
    if (!Number.isFinite(durationSec) || durationSec < 0.3) return { ok: false, error: "הסרטון קצר מדי או שלא ניתן לקרוא את אורכו." };
    if (durationSec > limits.maxVideoSeconds) {
      return { ok: false, error: `הסרטון ארוך מדי (${Math.round(durationSec)} שניות). האורך המרבי הוא ${limits.maxVideoSeconds} שניות.` };
    }
    const rotation = rotationOf(video);
    const swap = rotation === 90 || rotation === 270;
    return {
      ok: true,
      meta: {
        width: swap ? video.height : video.width,
        height: swap ? video.width : video.height,
        durationMs: Math.round(durationSec * 1000),
        fps: parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate),
        hasAudio: Boolean(audio),
        formatName,
        videoCodec: video.codec_name ?? null,
        audioCodec: audio?.codec_name ?? null,
        rotation,
      },
    };
  }

  // AUDIO
  if (!audio) return { ok: false, error: "לא נמצא ערוץ אודיו בקובץ." };
  if (video) return { ok: false, error: "הקובץ מכיל וידאו. יש להעלות אותו כסרטון." };
  if (!Number.isFinite(durationSec) || durationSec < 0.2) return { ok: false, error: "קובץ האודיו קצר מדי או פגום." };
  if (durationSec > limits.maxAudioSeconds) {
    return { ok: false, error: `קובץ האודיו ארוך מדי. האורך המרבי הוא ${Math.round(limits.maxAudioSeconds / 60)} דקות.` };
  }
  return {
    ok: true,
    meta: { width: null, height: null, durationMs: Math.round(durationSec * 1000), fps: null, hasAudio: true, formatName, videoCodec: null, audioCodec: audio.codec_name ?? null, rotation: 0 },
  };
}
