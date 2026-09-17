import { withSystem } from './db';
import { logOperation } from './logger';

/**
 * Rate limiting (spec §45).
 *
 * Backed by the `rate_limits` table, because the previous implementation was
 * a Map in the Node process and that meant the limits did not actually hold:
 * a restart cleared every window, so ten failed logins followed by a deploy
 * were ten more failed logins, and behind two instances each got its own full
 * allowance — the real limit was the configured one times the instance count.
 * It was documented as a limitation rather than hidden (R-008), which is
 * better than pretending, but a documented hole is still a hole.
 *
 * The decision is one statement in `rate_limit_hit`, atomic under
 * concurrency, and the window resets by comparing a stored timestamp rather
 * than by anybody sweeping.
 */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

/**
 * A rate limiter should never be the reason a request fails.
 *
 * If the database is unreachable the caller has bigger problems, and the next
 * statement in the handler is going to hit the same database and report it
 * properly. Failing OPEN is the deliberate choice: the alternative turns a
 * blip into a total outage of login, and denies service in the name of
 * preventing denial of service. It is logged so the blindness is visible.
 */
const FAIL_OPEN: RateLimitResult = { allowed: true, remaining: 0, retryAfterSeconds: 0 };

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const row = await withSystem((db) =>
      db.one<{ allowed: boolean; remaining: number; retry_after_seconds: number }>(
        'select allowed, remaining, retry_after_seconds from rate_limit_hit($1,$2,$3)',
        [key, limit, windowSeconds],
      ),
    );
    if (!row) return FAIL_OPEN;
    return {
      allowed: row.allowed,
      remaining: row.remaining,
      retryAfterSeconds: row.retry_after_seconds,
    };
  } catch (error) {
    logOperation({
      operation: 'rate_limit.unavailable',
      result: 'error',
      meta: {
        message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      },
    });
    return FAIL_OPEN;
  }
}

/** Test seam: forget every window. */
export async function resetRateLimits(): Promise<void> {
  await withSystem((db) => db.query('delete from rate_limits'));
}
