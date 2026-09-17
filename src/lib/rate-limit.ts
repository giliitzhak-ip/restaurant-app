/**
 * Rate limiting (spec §45).
 *
 * In-process fixed-window counter. Adequate for a single-instance MVP and
 * deliberately simple.
 *
 * LIMITATION, stated rather than hidden: this is per-process memory, so with
 * multiple instances each gets its own allowance, and it resets on restart.
 * Production behind more than one instance needs a shared store (Redis, or a
 * Postgres table). Tracked as R-008 in docs/RISKS.md.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Test seam. */
export function resetRateLimits(): void {
  windows.clear();
}
