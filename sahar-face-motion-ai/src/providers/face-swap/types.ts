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
  video: VideoInfo;
  target: FaceSelection | null; // null = provider default (usually the most prominent face)
};

export type CostEstimate = {
  costCents: number; // USD cents
  /** Hebrew explanation of how the price was computed. */
  basis: string;
  breakdown: { label: string; value: string }[];
  /** Where the price comes from, and when it was last checked against the vendor. */
  source: string;
  verifiedAt: string;
};

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
  | { state: "succeeded"; output: { kind: "url"; url: string } | { kind: "file"; path: string }; billedCents?: number }
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
  estimate(video: VideoInfo): CostEstimate;
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
