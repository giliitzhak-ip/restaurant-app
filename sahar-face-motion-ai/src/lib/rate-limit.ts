import "server-only";
import { redis } from "./redis";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };

/**
 * Fixed-window limiter in Redis. Fails open if Redis is unreachable so an
 * outage of the queue store does not lock every user out of login; the
 * failure is visible on the system status page.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  try {
    const r = redis();
    const count = await r.incr(k);
    if (count === 1) await r.expire(k, windowSec);
    const ttl = await r.ttl(k);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec: ttl > 0 ? ttl : windowSec };
  } catch {
    return { allowed: true, remaining: limit, retryAfterSec: 0 };
  }
}
