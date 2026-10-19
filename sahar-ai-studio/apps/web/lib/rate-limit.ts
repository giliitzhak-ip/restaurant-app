import type { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitRule {
  /** Logical bucket name, e.g. "login:ip". */
  name: string;
  limit: number;
  windowMs: number;
}

/**
 * Fixed-window rate limiter on Redis. Atomic (MULTI): INCR then set the expiry only when
 * the key is new (PEXPIRE NX, Redis ≥ 7), so concurrent requests cannot reset the window.
 */
export async function consumeRateLimit(
  redis: Redis,
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const key = `sahar:rl:${rule.name}:${identifier}`;
  const results = await redis.multi().incr(key).pexpire(key, rule.windowMs, 'NX').pttl(key).exec();

  if (!results) throw new Error('Rate limit transaction aborted');
  for (const [error] of results) if (error) throw error;

  const count = Number(results[0]?.[1]);
  const ttl = Number(results[2]?.[1]);
  const allowed = count <= rule.limit;
  return {
    allowed,
    remaining: Math.max(0, rule.limit - count),
    retryAfterMs: allowed ? 0 : Math.max(ttl, 0),
  };
}

/** Auth limits (login windows: 15 minutes, registration window: 1 hour). Tunable via env. */
export function authRateLimits(env: {
  AUTH_LOGIN_MAX_PER_IP: number;
  AUTH_LOGIN_MAX_PER_EMAIL: number;
  AUTH_REGISTER_MAX_PER_IP: number;
}) {
  return {
    loginPerIp: { name: 'login:ip', limit: env.AUTH_LOGIN_MAX_PER_IP, windowMs: 15 * 60_000 },
    loginPerEmail: {
      name: 'login:email',
      limit: env.AUTH_LOGIN_MAX_PER_EMAIL,
      windowMs: 15 * 60_000,
    },
    registerPerIp: {
      name: 'register:ip',
      limit: env.AUTH_REGISTER_MAX_PER_IP,
      windowMs: 60 * 60_000,
    },
  } satisfies Record<string, RateLimitRule>;
}
