/**
 * Normalized provider contract. Provider-specific request/response shapes stay inside
 * each adapter; the rest of the system only sees these types.
 */

export type ProviderKey = 'mock' | 'local-gpu';
export type GenerationOperation = 'AUDIO_TO_VIDEO' | 'LIP_SYNC';
export type AspectRatioKey = '16:9' | '9:16';

/** "technical-test" output is never presented as AI-generated. */
export type ProviderKind = 'technical-test' | 'ai';

export interface PricingInfo {
  model: 'free' | 'per-second' | 'per-generation' | 'credits';
  /** Decimal string to avoid float rounding, e.g. "0.0500". */
  usdPerSecond?: string;
  /** Where the price comes from, and when it was last checked against that source. */
  source: string;
  verifiedAt: string;
}

export interface ProviderCapabilities {
  operations: GenerationOperation[];
  inputs: ('audio' | 'reference-image' | 'prompt' | 'video')[];
  minDurationMs: number;
  maxDurationMs: number;
  aspectRatios: AspectRatioKey[];
  resolutions: { width: number; height: number }[];
  pricing: PricingInfo;
  supportsCancel: boolean;
  supportsWebhooks: boolean;
  execution: 'local' | 'remote';
}

export interface Availability {
  operational: boolean;
  /** Machine-readable reason when not operational (mapped to UI text by the app). */
  reason?: 'not-implemented' | 'missing-credentials' | 'missing-dependency' | 'disabled';
}

export interface CostEstimate {
  /** Decimal string in USD, e.g. "0.00". */
  amountUsd: string;
  billable: boolean;
  units: number;
  unitName: 'seconds' | 'generations' | 'credits';
  /** Short machine-readable basis, e.g. "local-ffmpeg". */
  basis: string;
}

export interface GenerationRequest {
  operation: GenerationOperation;
  /** Segment of the original song, in ms. */
  startMs: number;
  endMs: number;
  width: number;
  height: number;
  fps: number;
}

/** Everything a provider needs, as local files prepared by the worker. */
export interface GenerationInput extends GenerationRequest {
  songPath: string;
  referenceImagePath: string | null;
  prompt: string;
  /** Text burned into technical test renders (scene label etc.). */
  label: string;
}

export interface GenerationOutput {
  path: string;
  mimeType: 'video/mp4';
}

export interface LocalRunContext {
  workDir: string;
  /** Real progress in [0, 1]. */
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

export interface LocalExecution {
  kind: 'local';
  run(input: GenerationInput, ctx: LocalRunContext): Promise<GenerationOutput>;
}

export type RemoteStatus =
  | { state: 'queued' | 'processing'; progress?: number }
  | { state: 'completed' }
  | { state: 'failed'; error: string }
  | { state: 'cancelled' };

export interface RemoteExecution {
  kind: 'remote';
  submit(
    input: GenerationInput,
    opts: { idempotencyKey: string },
  ): Promise<{ providerJobId: string }>;
  getStatus(providerJobId: string): Promise<RemoteStatus>;
  fetchResult(providerJobId: string, destinationPath: string): Promise<GenerationOutput>;
  cancel?(providerJobId: string): Promise<void>;
}

export interface VideoProvider {
  key: ProviderKey;
  kind: ProviderKind;
  capabilities: ProviderCapabilities;
  availability(): Availability;
  estimateCost(request: GenerationRequest): CostEstimate;
  execution: LocalExecution | RemoteExecution;
}

export class GenerationAbortedError extends Error {
  constructor() {
    super('generation aborted');
    this.name = 'GenerationAbortedError';
  }
}

export class ProviderNotImplementedError extends Error {
  constructor(key: string) {
    super(`provider "${key}" has no working backend`);
    this.name = 'ProviderNotImplementedError';
  }
}
