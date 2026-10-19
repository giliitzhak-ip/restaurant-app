/** BullMQ queue names. Shared so producers (web) and consumers (worker) never drift. */
export const QUEUE_NAMES = {
  maintenance: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const MAINTENANCE_JOBS = {
  purgeExpiredSessions: 'purge-expired-sessions',
} as const;

/** Redis key the worker refreshes periodically; its presence means a worker is alive. */
export const WORKER_HEARTBEAT_KEY = 'sahar:worker:heartbeat';
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
export const WORKER_HEARTBEAT_TTL_SECONDS = 30;
