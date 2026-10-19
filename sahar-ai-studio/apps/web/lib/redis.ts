import 'server-only';
import { Redis } from 'ioredis';
import { getServerEnv } from './env';
import { logger } from './logger';

const globalForRedis = globalThis as unknown as { __saharRedis?: Redis };

/** Shared Redis connection for the web process (rate limiting, health checks). */
export function getRedis(): Redis {
  if (!globalForRedis.__saharRedis) {
    const client = new Redis(getServerEnv().REDIS_URL, {
      // Commands wait for the initial connection, but during an outage each command fails
      // after one reconnect attempt instead of hanging (auth rate limiting fails closed).
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    });
    client.on('error', (error) => logger.warn({ err: error.message }, 'redis connection error'));
    globalForRedis.__saharRedis = client;
  }
  return globalForRedis.__saharRedis;
}
