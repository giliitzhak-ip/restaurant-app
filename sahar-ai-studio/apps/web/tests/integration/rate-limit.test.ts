import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { consumeRateLimit } from '@/lib/rate-limit';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL must be set for integration tests');
const redis = new Redis(redisUrl);

afterAll(() => {
  redis.disconnect();
});

describe('consumeRateLimit (real Redis)', () => {
  it('allows up to the limit within a window, then blocks with a retry hint', async () => {
    const rule = { name: `test:${randomUUID()}`, limit: 3, windowMs: 10_000 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consumeRateLimit(redis, rule, 'ip-1'));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results[2]!.remaining).toBe(0);
    expect(results[3]!.retryAfterMs).toBeGreaterThan(0);
    expect(results[3]!.retryAfterMs).toBeLessThanOrEqual(10_000);
  });

  it('keeps identifiers independent', async () => {
    const rule = { name: `test:${randomUUID()}`, limit: 1, windowMs: 10_000 };
    expect((await consumeRateLimit(redis, rule, 'a')).allowed).toBe(true);
    expect((await consumeRateLimit(redis, rule, 'b')).allowed).toBe(true);
    expect((await consumeRateLimit(redis, rule, 'a')).allowed).toBe(false);
  });

  it('is atomic under concurrency', async () => {
    const rule = { name: `test:${randomUUID()}`, limit: 10, windowMs: 10_000 };
    const results = await Promise.all(
      Array.from({ length: 30 }, () => consumeRateLimit(redis, rule, 'c')),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });

  it('resets after the window expires', async () => {
    const rule = { name: `test:${randomUUID()}`, limit: 1, windowMs: 200 };
    expect((await consumeRateLimit(redis, rule, 'd')).allowed).toBe(true);
    expect((await consumeRateLimit(redis, rule, 'd')).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await consumeRateLimit(redis, rule, 'd')).allowed).toBe(true);
  });
});
