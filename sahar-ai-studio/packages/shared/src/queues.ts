/** BullMQ queue names. Shared so producers (web) and consumers (worker) never drift. */
export const QUEUE_NAMES = {
  maintenance: 'maintenance',
  media: 'media',
  generation: 'generation',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const MAINTENANCE_JOBS = {
  purgeExpiredSessions: 'purge-expired-sessions',
} as const;

export const MEDIA_JOBS = {
  verifyImage: 'verify-image',
  analyzeAudio: 'analyze-audio',
} as const;

export type MediaJobName = (typeof MEDIA_JOBS)[keyof typeof MEDIA_JOBS];

export interface MediaJobData {
  assetId: string;
}

/** One job per asset and kind: re-enqueueing the same asset is a no-op while it exists. */
export function mediaJobId(name: MediaJobName, assetId: string): string {
  return `${name}-${assetId}`;
}

/** Redis key the worker refreshes periodically; its presence means a worker is alive. */
export const WORKER_HEARTBEAT_KEY = 'sahar:worker:heartbeat';
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
export const WORKER_HEARTBEAT_TTL_SECONDS = 30;

export const GENERATION_JOB = 'generate';

export interface GenerationJobData {
  generationJobId: string;
}

/** Retry policy for generation jobs (shared by the web enqueue and worker reconciliation). */
export const GENERATION_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
};
