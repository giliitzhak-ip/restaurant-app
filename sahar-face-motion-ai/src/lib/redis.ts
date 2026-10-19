import "server-only";
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function redis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
    });
    // Errors surface through command rejections; avoid unhandled 'error' events crashing the process.
    globalForRedis.redis.on("error", () => {});
  }
  return globalForRedis.redis;
}
