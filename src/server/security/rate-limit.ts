import { headers } from "next/headers";
import { isProduction } from "@/config/env";

/**
 * Rate limiting.
 *
 * Two drivers behind one call:
 *
 *  - **redis** — an Upstash-compatible REST endpoint (`RATE_LIMIT_REDIS_URL` +
 *    `RATE_LIMIT_REDIS_TOKEN`). Counters are shared across every instance, so
 *    the limit is the limit no matter how many containers are running.
 *  - **memory** — a per-process map. Correct for a single dev server and
 *    useless behind a load balancer, which is exactly why production refuses
 *    to boot without the Redis URL (see src/config/env.ts).
 *
 * The window is a fixed bucket rather than a sliding log: one `INCR` plus a
 * conditional `EXPIRE`, which is cheap, survives restarts and is accurate
 * enough for abuse control.
 */

export interface RateLimitRule {
  /** Requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the current window rolls over. */
  retryAfter: number;
}

/** Named rules, so limits are reviewable in one place. */
export const RATE_LIMITS = {
  login: { limit: 8, windowSec: 300 },
  register: { limit: 5, windowSec: 3600 },
  newsletter: { limit: 5, windowSec: 3600 },
  quote: { limit: 6, windowSec: 3600 },
  checkout: { limit: 10, windowSec: 600 },
  roomAnalysis: { limit: 30, windowSec: 600 },
  upload: { limit: 20, windowSec: 600 },
  designWrite: { limit: 60, windowSec: 600 },
  /*
   * Generous: a visitor toggling categories in the settings panel is a normal
   * thing to do several times in a minute, and a limiter that blocks someone
   * from *withdrawing* consent would be worse than the abuse it prevents.
   */
  consent: { limit: 40, windowSec: 600 },
  /* A cancellation is a legal notice. Enough to retry, not enough to flood. */
  cancellation: { limit: 5, windowSec: 3600 },
  dataRequest: { limit: 5, windowSec: 3600 },
  unsubscribe: { limit: 20, windowSec: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const existing = memory.get(key);
  if (!existing || existing.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + rule.windowSec * 1000 });
    return { ok: true, remaining: rule.limit - 1, retryAfter: rule.windowSec };
  }
  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  if (memory.size > 10_000) {
    // Opportunistic sweep — this map only exists in development.
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  }
  return {
    ok: existing.count <= rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    retryAfter,
  };
}

async function redisHit(key: string, rule: RateLimitRule): Promise<RateLimitResult | null> {
  const url = process.env.RATE_LIMIT_REDIS_URL;
  const token = process.env.RATE_LIMIT_REDIS_TOKEN;
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const base = url.replace(/\/$/, "");
    const auth = token ? { authorization: `Bearer ${token}` } : undefined;
    const incr = await fetch(`${base}/incr/${encodeURIComponent(key)}`, {
      headers: auth,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!incr.ok) return null;
    const { result } = (await incr.json()) as { result: number };
    if (result === 1) {
      await fetch(`${base}/expire/${encodeURIComponent(key)}/${rule.windowSec}`, {
        headers: auth,
        cache: "no-store",
        signal: controller.signal,
      });
    }
    return {
      ok: result <= rule.limit,
      remaining: Math.max(0, rule.limit - result),
      retryAfter: rule.windowSec,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort client identity.
 *
 * Proxy headers are attacker-controlled in general, but this app is meant to
 * run behind a trusted edge (Vercel, Cloudflare, a reverse proxy) that
 * overwrites them. The left-most `x-forwarded-for` entry is what that edge
 * reports as the client.
 */
export async function clientKey(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return store.get("x-real-ip") ?? store.get("cf-connecting-ip") ?? "unknown";
}

/**
 * Consumes one unit against a named rule.
 *
 * `scope` narrows the bucket beyond the caller's IP — an email address for
 * login, a user id for uploads — so one abusive client cannot lock out
 * everyone sharing a NAT.
 */
export async function rateLimit(
  name: RateLimitName,
  scope?: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const ip = await clientKey();
  const key = `rl:${name}:${scope ? `${scope}:` : ""}${ip}`;

  const viaRedis = await redisHit(key, rule);
  if (viaRedis) return viaRedis;

  if (isProduction && process.env.RATE_LIMIT_REDIS_URL) {
    // Redis is configured but unreachable. Failing open beats taking the shop
    // offline, and the miss is logged so it surfaces in monitoring.
    console.error(`[rate-limit] redis unavailable, failing open for ${name}`);
    return { ok: true, remaining: rule.limit, retryAfter: rule.windowSec };
  }

  return memoryHit(key, rule);
}

/**
 * Frees a consumed unit when the guarded action turned out not to happen.
 *
 * Only affects the in-process driver — a refund against Redis would need the
 * exact key and is not worth a round trip for the cases this covers.
 */
export function rateLimitRefund(name: RateLimitName, ip: string, scope?: string) {
  const key = `rl:${name}:${scope ? `${scope}:` : ""}${ip}`;
  const entry = memory.get(key);
  if (entry && entry.count > 0) entry.count -= 1;
}
