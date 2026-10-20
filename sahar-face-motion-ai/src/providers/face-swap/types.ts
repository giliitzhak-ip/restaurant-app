/**
 * Face swap provider contract. One adapter per vendor (cloud API), plus the
 * mock (local FFmpeg, free) and a future self-hosted GPU worker. The job
 * runner (src/worker/ai-job.ts) only talks to this interface.
 *
 * Billing safety: `start` is called at most once per job. Its providerJobId is
 * persisted before polling, so a worker restart resumes polling and never
 * submits (and pays) twice.
 */

export type VideoInfo = { durationSec: number; width: number; height: number; fps: number | null; hasAudio: boolean };

export type FaceSelection = {
  personIndex: number;
  /** Normalised 0..1 box of the chosen face at `timeSec` (from our own detector). */
  box: { x: number; y: number; w: number; h: number };
  timeSec: number;
  /** Cropped thumbnail of the chosen face (some providers match by reference image). */
  thumb?: ProviderMedia;
  /** How many different people the detector found. */
  personsInVideo: number;
};

export type ProviderMedia = {
  /** Local copy on the worker (always available). */
  localPath: string;
  mimeType: string;
  /** Lazily creates a time-limited URL the provider can download from. */
  url: () => Promise<string>;
};

export type FaceSwapRequest = {
  jobId: string;
  sourceImage: ProviderMedia;
  targetVideo: ProviderMedia;
  /** Full source video info. */
  video: VideoInfo;
  clip: ClipOptions;
  target: FaceSelection | null; // null = provider default (usually the most prominent face)
};

export type CostEstimate = {
  costCents: number; // USD cents
  /** Provider units the job consumes (e.g. Magic Hour credits), when the provider bills in credits. */
  credits?: number;
  /** Hebrew explanation of how the price was computed. */
  basis: string;
  breakdown: { label: string; value: string }[];
  /** Where the price comes from, and when it was last checked against the vendor. */
  source: string;
  verifiedAt: string;
};

/** What the provider account has left, for providers that expose it (e.g. Magic Hour GET /v1/account). */
export type ProviderAccount = {
  credits: number;
  tier: string; // e.g. "free" | "creator" | "pro" | "business"
  subscription: string | null; // plan name, or null when there is no subscription
};

/** Optional clip selection: only this part of the video is sent (saves credits). */
export type ClipOptions = { startSec: number; endSec: number; maxFps: 30 | 24 | 15 };

export type Capabilities = {
  maxDurationSec: number;
  minDurationSec: number;
  /** Largest output height (short side for portrait) the provider returns. */
  maxOutputShortSide: number;
  maxInputBytes: number;
  /** How the user's chosen person is passed: not at all, by a reference crop, or by box. */
  faceSelection: "none" | "reference-image" | "box";
  keepsAudio: boolean;
  /** True when the provider must download our files from a public URL (vs. an upload API). */
  needsPublicUrls: boolean;
};

export type StartResult = { providerJobId: string };

export type PollResult =
  | { state: "running"; progress?: number }
  | { state: "succeeded"; output: { kind: "url"; url: string } | { kind: "file"; path: string }; billedCents?: number; billedCredits?: number }
  | { state: "failed"; message: string; code?: string };

export type ProviderContext = {
  onProgress: (fraction: number) => void;
  signal?: AbortSignal;
};

export interface FaceSwapProvider {
  id: string;
  displayName: string;
  paid: boolean;
  requiredEnv: string[];
  capabilities: Capabilities;
  /** Hebrew notes shown next to the provider (licence, retention, quality). */
  notes: string[];
  /** Estimate for the clip that will actually be sent (duration/fps already reduced by ClipOptions). */
  estimate(video: VideoInfo): CostEstimate;
  /** Local prerequisites (e.g. an installed engine). Keys are checked separately via requiredEnv. */
  available?(): { ok: boolean; detail: string };
  /** Remaining credits and plan, when the provider has an API for it. */
  account?(): Promise<ProviderAccount>;
  start(req: FaceSwapRequest, ctx: ProviderContext): Promise<StartResult>;
  poll(providerJobId: string, ctx: ProviderContext): Promise<PollResult>;
}

/** Hebrew reasons a video can't be processed by this provider, or [] if fine. */
export function checkLimits(p: FaceSwapProvider, v: VideoInfo, sizeBytes: number): string[] {
  const c = p.capabilities;
  const out: string[] = [];
  if (v.durationSec > c.maxDurationSec) out.push(`הסרטון ארוך מדי עבור ${p.displayName}: ${Math.round(v.durationSec)} שניות (מקסימום ${c.maxDurationSec}). קצרו אותו ונסו שוב.`);
  if (v.durationSec < c.minDurationSec) out.push(`הסרטון קצר מדי (מינימום ${c.minDurationSec} שניות).`);
  if (sizeBytes > c.maxInputBytes) out.push(`קובץ הסרטון גדול מדי עבור הספק (מקסימום ${Math.round(c.maxInputBytes / 1024 / 1024)}MB).`);
  return out;
}

/** The video as it will be sent after trimming and fps capping. */
export function clippedVideo(v: VideoInfo, clip: ClipOptions): VideoInfo {
  const start = Math.max(0, Math.min(clip.startSec, v.durationSec));
  const end = Math.max(start, Math.min(clip.endSec, v.durationSec));
  return { ...v, durationSec: Math.round((end - start) * 1000) / 1000, fps: Math.min(clip.maxFps, v.fps && v.fps > 0 ? v.fps : 30) };
}

export function fullClip(v: VideoInfo): ClipOptions {
  return { startSec: 0, endSec: v.durationSec, maxFps: 30 };
}
