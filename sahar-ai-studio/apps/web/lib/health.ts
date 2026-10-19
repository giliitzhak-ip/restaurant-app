import 'server-only';
import { prisma } from '@sahar/db';
import { WORKER_HEARTBEAT_KEY } from '@sahar/shared';
import { getServerEnv } from './env';
import { getRedis } from './redis';

export interface HealthReport {
  database: boolean;
  redis: boolean;
  /** True when the worker refreshed its heartbeat key recently. */
  worker: boolean;
  /** Storage credentials present. Connectivity is checked once uploads exist (Phase 2). */
  storageConfigured: boolean;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function checkHealth(): Promise<HealthReport> {
  const env = getServerEnv();
  const [database, redisResult] = await Promise.all([
    withTimeout(prisma.$queryRaw`SELECT 1`, 2_000).then(
      () => true,
      () => false,
    ),
    withTimeout(
      (async () => {
        const redis = getRedis();
        const [pong, heartbeat] = await Promise.all([
          redis.ping(),
          redis.get(WORKER_HEARTBEAT_KEY),
        ]);
        return { redis: pong === 'PONG', worker: heartbeat !== null };
      })(),
      2_000,
    ).catch(() => ({ redis: false, worker: false })),
  ]);

  return {
    database,
    redis: redisResult.redis,
    worker: redisResult.worker,
    storageConfigured: Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY),
  };
}
