import "server-only";
import { db } from "./db";

type Level = "debug" | "info" | "warn" | "error";

/** Writes to activity_log and to the server console. Never throws. Never logs secrets. */
export async function log(
  level: Level,
  event: string,
  message: string,
  extra: { postId?: string | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
  const line = `[${level}] ${event}: ${message}`;
  if (level === "error") console.error(line, extra.meta ?? "");
  else console.log(line);
  try {
    await db()
      .from("activity_log")
      .insert({
        level,
        event,
        message: message.slice(0, 2000),
        post_id: extra.postId ?? null,
        meta: redact(extra.meta),
      });
  } catch (e) {
    console.error("log write failed", e);
  }
}

const SECRET_KEYS = /token|secret|password|authorization|api[_-]?key/i;
function redact(meta?: Record<string, unknown>): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : v;
  return out;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
