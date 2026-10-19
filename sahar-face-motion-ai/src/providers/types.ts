/**
 * Provider contracts. Each AI capability is a separate interface so a module
 * (Face Swap, Motion Transfer, Voice, Lip Sync) can switch vendor — cloud API,
 * self-hosted GPU worker, or the mock — without touching UI or job code.
 *
 * All long-running operations are asynchronous: `submit` returns a provider job
 * reference, and the worker calls `poll` until it finishes. Inputs and outputs
 * are references to files in our own S3 storage (signed URLs), never raw bytes
 * passed through the web process.
 */

export type ModuleKey = "faceSwap" | "motion" | "voice" | "lipSync";

export type MediaRef = {
  /** Short-lived signed URL the provider can download from. */
  url: string;
  mimeType: string;
};

export type ProviderJobRef = { providerJobId: string };

export type ProviderPoll =
  | { state: "running"; progress?: number }
  | { state: "succeeded"; output: MediaRef[] }
  | { state: "failed"; errorCode: string; message: string };

export interface ProviderInfo {
  id: string; // "mock", "elevenlabs", "sync", "fal", ...
  displayName: string;
  /** True for providers that bill per use. Blocked unless ALLOW_PAID_PROVIDERS=true. */
  paid: boolean;
  /** Env vars that must be set for this provider to work. */
  requiredEnv: string[];
}

export interface FaceSwapProvider extends ProviderInfo {
  swapVideo(input: {
    sourceFace: MediaRef;
    targetVideo: MediaRef;
    /** Index of the face selected by the user (from face detection), when supported. */
    targetFaceIndex?: number;
  }): Promise<ProviderJobRef>;
  poll(ref: ProviderJobRef): Promise<ProviderPoll>;
}

export interface MotionTransferProvider extends ProviderInfo {
  animate(input: { characterImage: MediaRef; drivingVideo: MediaRef }): Promise<ProviderJobRef>;
  poll(ref: ProviderJobRef): Promise<ProviderPoll>;
}

export type TtsRequest = {
  text: string;
  voiceId: string;
  language: "he" | string;
  /** 0.7–1.2 typical; providers clamp to their own range. */
  speed?: number;
  stability?: number;
  style?: number;
  format: "mp3" | "wav";
};

export interface VoiceProvider extends ProviderInfo {
  supportsHebrew: boolean;
  listVoices(): Promise<{ id: string; name: string; gender?: string; preview?: string }[]>;
  /** TTS is short enough to run synchronously inside the worker. */
  textToSpeech(req: TtsRequest): Promise<{ audio: Buffer; mimeType: string }>;
}

export interface LipSyncProvider extends ProviderInfo {
  lipSync(input: { video: MediaRef; audio: MediaRef }): Promise<ProviderJobRef>;
  poll(ref: ProviderJobRef): Promise<ProviderPoll>;
}
