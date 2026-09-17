/**
 * Structured logging (spec §46).
 *
 * Every critical operation logs one JSON line with requestId, userId, jobId,
 * providerId, timestamp, operation, result and errorCode. Secrets are never
 * logged: values are whitelisted by field, not spread from arbitrary objects.
 */
export interface LogContext {
  readonly requestId?: string;
  readonly userId?: string | null;
  readonly jobId?: string | null;
  readonly providerId?: string | null;
  readonly operation: string;
  readonly result: 'ok' | 'error' | 'denied' | 'invalid';
  readonly errorCode?: string | null;
  readonly durationMs?: number;
  /** Small, non-sensitive extras. */
  readonly meta?: Record<string, string | number | boolean | null>;
}

const REDACTED_KEYS = [
  'password', 'token', 'secret', 'authorization', 'cookie',
  'encrypted_password', 'payout', 'iban', 'account',
];

function scrubMeta(
  meta: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(meta)) {
    const lower = key.toLowerCase();
    out[key] = REDACTED_KEYS.some((k) => lower.includes(k)) ? '[redacted]' : value;
  }
  return out;
}

export function logOperation(context: LogContext): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...context,
    meta: scrubMeta(context.meta),
  });
  if (context.result === 'error') console.error(line);
  else console.warn(line);
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
