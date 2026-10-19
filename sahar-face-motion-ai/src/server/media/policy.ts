export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO";


type FileType = { kind: MediaKind; mime: string };

// Allow-list by extension. The browser-sent MIME type is only a hint; the real
// content is verified later with FFprobe in the media worker.
const BY_EXT: Record<string, FileType> = {
  jpg: { kind: "IMAGE", mime: "image/jpeg" },
  jpeg: { kind: "IMAGE", mime: "image/jpeg" },
  png: { kind: "IMAGE", mime: "image/png" },
  webp: { kind: "IMAGE", mime: "image/webp" },
  heic: { kind: "IMAGE", mime: "image/heic" },
  heif: { kind: "IMAGE", mime: "image/heif" },
  mp4: { kind: "VIDEO", mime: "video/mp4" },
  m4v: { kind: "VIDEO", mime: "video/x-m4v" },
  mov: { kind: "VIDEO", mime: "video/quicktime" },
  webm: { kind: "VIDEO", mime: "video/webm" },
  mp3: { kind: "AUDIO", mime: "audio/mpeg" },
  wav: { kind: "AUDIO", mime: "audio/wav" },
  m4a: { kind: "AUDIO", mime: "audio/mp4" },
  aac: { kind: "AUDIO", mime: "audio/aac" },
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

export const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,.heic,.mov,.m4a";

export type Classified = { ok: true; kind: MediaKind; mime: string; ext: string } | { ok: false; error: string };

/** Decide what an upload is from its file name and declared MIME type. */
export function classifyUpload(fileName: string, declaredMime: string | null): Classified {
  const nameExt = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  const mimeExt = declaredMime ? EXT_BY_MIME[declaredMime.toLowerCase().split(";")[0]!.trim()] : undefined;
  const ext = nameExt && BY_EXT[nameExt] ? nameExt : mimeExt;
  if (!ext || !BY_EXT[ext]) {
    return {
      ok: false,
      error: "סוג הקובץ אינו נתמך. ניתן להעלות תמונות (JPG, PNG, WEBP, HEIC), סרטונים (MP4, MOV, WEBM) ואודיו (MP3, WAV, M4A).",
    };
  }
  const t = BY_EXT[ext]!;
  return { ok: true, kind: t.kind, mime: t.mime, ext: ext === "jpeg" ? "jpg" : ext };
}

export type MediaLimits = {
  maxBytes: Record<MediaKind, number>;
  maxVideoSeconds: number;
  maxAudioSeconds: number;
  maxStorageBytesPerUser: number;
};

const mb = (v: string | undefined, def: number) => Math.max(1, Number(v) || def) * 1024 * 1024;

export function mediaLimits(env: Record<string, string | undefined> = process.env): MediaLimits {
  return {
    maxBytes: {
      IMAGE: mb(env.MAX_IMAGE_MB, 15),
      VIDEO: mb(env.MAX_VIDEO_MB, 500),
      AUDIO: mb(env.MAX_AUDIO_MB, 50),
    },
    maxVideoSeconds: Number(env.MAX_VIDEO_SECONDS) || 180,
    maxAudioSeconds: Number(env.MAX_AUDIO_SECONDS) || 600,
    maxStorageBytesPerUser: mb(env.MAX_STORAGE_MB_PER_USER, 5120),
  };
}

export { formatBytes } from "@/lib/format";
