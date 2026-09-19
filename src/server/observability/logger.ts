/**
 * Structured logging.
 *
 * One JSON object per line, so a log drain can filter on `event` and `level`
 * without regex archaeology. Two rules hold everywhere:
 *
 *  - never log a secret, a card field, or a full customer record;
 *  - never log an email, phone or address at info level — an order id is
 *    enough to find the row, and the row is access-controlled.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "").toLowerCase() as LogLevel;
  if (configured in LEVELS) return LEVELS[configured];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

const SECRET_KEY = /(secret|token|password|authorization|api[_-]?key|cookie)/i;

function safeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY.test(key)) {
      out[key] = "[redacted]";
    } else if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message };
    } else if (typeof value === "string") {
      out[key] = value.length > 500 ? `${value.slice(0, 500)}…` : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level: LogLevel, event: string, fields: Record<string, unknown>) {
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...safeFields(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields: Record<string, unknown> = {}) => emit("debug", event, fields),
  info: (event: string, fields: Record<string, unknown> = {}) => emit("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) => emit("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) => emit("error", event, fields),
};

/**
 * Reports an exception to an error monitor when one is configured.
 *
 * Kept as a seam rather than a Sentry dependency: set ERROR_WEBHOOK_URL and
 * anything that speaks HTTP receives the event. Swapping in an SDK means
 * editing this function and nothing else.
 */
export async function captureError(error: unknown, context: Record<string, unknown> = {}) {
  const payload = {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 12).join("\n") : undefined,
    ...safeFields(context),
  };
  log.error("exception", payload);

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    const { fetchWithTimeout } = await import("@/server/http/fetch-with-timeout");
    await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
      { timeoutMs: 3000, label: "error-monitor" },
    );
  } catch {
    // Monitoring must never take down the request it was reporting on.
  }
}
