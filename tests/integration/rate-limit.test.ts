import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { rateLimit, resetRateLimits } from '@/lib/rate-limit';
import { getPool, withSystem } from '@/lib/db';
import { closeAdminPool } from '../helpers/fixtures';

/**
 * Rate limiting held in the database rather than in one process's memory.
 *
 * The previous implementation was a Map, and the limits did not really hold:
 * a restart cleared every window, and behind two instances each got its own
 * full allowance. Documented as R-008 rather than hidden, which is better
 * than pretending — but a documented hole is still a hole.
 */
describe('rate limiting', () => {
  const key = () => `test:${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    await resetRateLimits();
  });

  afterAll(async () => {
    await resetRateLimits();
    await closeAdminPool();
    await getPool().end();
  });

  it('allows up to the limit and refuses after it, with a real retry-after', async () => {
    const k = key();
    for (let i = 0; i < 3; i += 1) {
      const result = await rateLimit(k, 3, 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3 - i - 1);
    }

    const denied = await rateLimit(k, 3, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    // A number the caller can actually put in front of a person.
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('the window lives in the database, so a restart does not hand out a fresh one', async () => {
    const k = key();
    await rateLimit(k, 2, 300);
    await rateLimit(k, 2, 300);
    expect((await rateLimit(k, 2, 300)).allowed).toBe(false);

    // What "a restart" means for this implementation: the process forgets
    // everything and the count is still there. Verified against the row,
    // because that is the thing the old Map could not do.
    const row = await withSystem((db) =>
      db.one<{ count: number }>('select count from rate_limits where key = $1', [k]),
    );
    expect(row?.count).toBe(3);
  });

  it('counts concurrent hits exactly once each', async () => {
    const k = key();
    // Ten simultaneous requests against a limit of four. The decision is one
    // INSERT ... ON CONFLICT, so they serialise on the row instead of all
    // reading the same stale count — which is the failure a per-process
    // counter has under load, and the reason this is a single statement.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rateLimit(k, 4, 60)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(4);
    expect(results.filter((r) => !r.allowed)).toHaveLength(6);

    const row = await withSystem((db) =>
      db.one<{ count: number }>('select count from rate_limits where key = $1', [k]),
    );
    expect(row?.count).toBe(10);
  });

  it('a closed window resets without anything having to sweep it', async () => {
    const k = key();
    await rateLimit(k, 1, 60);
    expect((await rateLimit(k, 1, 60)).allowed).toBe(false);

    // The window is data. Age it and the very next hit is allowed — the old
    // implementation needed a sweeper for this, and a sweeper that does not
    // run is a limiter that never forgives.
    await withSystem((db) =>
      db.query(`update rate_limits set reset_at = now() - interval '1 second' where key = $1`, [k]),
    );
    expect((await rateLimit(k, 1, 60)).allowed).toBe(true);
  });

  it('two different keys do not share an allowance', async () => {
    const a = key();
    const b = key();
    await rateLimit(a, 1, 60);
    expect((await rateLimit(a, 1, 60)).allowed).toBe(false);
    expect((await rateLimit(b, 1, 60)).allowed).toBe(true);
  });
});
