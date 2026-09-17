import { ApiError } from './errors';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter.
 *
 * In-memory, so it is per-instance: good enough to blunt accidental loops and
 * casual abuse in a single-region deployment. Swap `buckets` for Redis or
 * Supabase when running multi-instance — the call sites do not change.
 */
const buckets = new Map<string, Bucket>();

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  createJob: { limit: 5, windowMs: 60 * 60 * 1000 },
  createOffer: { limit: 30, windowMs: 60 * 60 * 1000 },
  sendMessage: { limit: 60, windowMs: 60 * 1000 },
  updateLocation: { limit: 120, windowMs: 60 * 1000 },
  createReview: { limit: 10, windowMs: 60 * 60 * 1000 },
  auth: { limit: 10, windowMs: 15 * 60 * 1000 },
  search: { limit: 120, windowMs: 60 * 1000 },
  default: { limit: 100, windowMs: 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export function checkRateLimit(key: string, rule: RateLimitRule): void {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  if (existing.count >= rule.limit) {
    const seconds = Math.ceil((existing.resetAt - now) / 1000);
    throw ApiError.rateLimited(`יותר מדי בקשות. נסה שוב בעוד ${seconds} שניות.`);
  }

  existing.count += 1;

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
}

export function resetRateLimits() {
  buckets.clear();
}

/** Best-effort client identity for anonymous endpoints. */
export function clientKey(request: Request, suffix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `${ip}:${suffix}`;
}
