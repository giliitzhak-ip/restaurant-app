import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ForbiddenError, UnauthorizedError } from './auth';
import { isPgError, pgErrorName } from './db';
import { logOperation, newRequestId } from './logger';

/**
 * Uniform API envelope. Errors always carry a machine-readable `code` so the
 * UI can render the right state (spec §43) instead of guessing from prose.
 */
export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
  readonly requestId: string;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(
  code: string,
  message: string,
  status: number,
  requestId: string,
  details?: unknown,
): NextResponse {
  const body: ApiErrorBody = { error: { code, message, details }, requestId };
  return NextResponse.json(body, { status });
}

/** Domain errors that carry their own HTTP status and user-facing message. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Map errors raised by our SQL functions onto stable API codes.
 * These are the concurrency and lifecycle failures from spec §44.
 */
/**
 * Unique constraints whose violation has a meaning worth telling the user.
 * Keyed by the constraint name so the message tracks the schema.
 */
const UNIQUE_VIOLATIONS: Record<string, { code: string; message: string }> = {
  trade_proposals_unique_pending: {
    code: 'DUPLICATE_PROPOSAL',
    message: 'כבר שלחת את המקצוע הזה לאישור. הבקשה ממתינה לטיפול.',
  },
  provider_services_provider_id_service_id_key: {
    code: 'SERVICE_ALREADY_PRICED',
    message: 'השירות הזה כבר מופיע אצלך עם מחיר',
  },
  job_offers_job_id_provider_id_key: {
    code: 'OFFER_ALREADY_SENT',
    message: 'ההצעה הזו כבר נשלחה',
  },
  // Two reviewers naming the same new category at the same time. The loser
  // should retry and find it in the list, not read INTERNAL_ERROR.
  categories_unique_active_name: {
    code: 'CATEGORY_EXISTS',
    message: 'תחום בשם הזה כבר קיים — בחרו אותו מהרשימה',
  },
};

const DB_ERROR_MAP: Record<string, { code: string; message: string; status: number }> = {
  JOB_ALREADY_ASSIGNED: {
    code: 'JOB_ALREADY_ASSIGNED',
    message: 'העבודה כבר שובצה לבעל מקצוע אחר',
    status: 409,
  },
  OFFER_EXPIRED: {
    code: 'OFFER_EXPIRED',
    message: 'ההצעה פגה. נחפש עבורך הצעה חדשה',
    status: 410,
  },
  OFFER_NOT_PENDING: {
    code: 'OFFER_NOT_PENDING',
    message: 'ההצעה כבר טופלה',
    status: 409,
  },
  OFFER_NOT_YOURS: {
    code: 'FORBIDDEN',
    message: 'אין לך הרשאה לפעולה הזו',
    status: 403,
  },
  OFFER_NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'ההצעה לא נמצאה',
    status: 404,
  },
  JOB_NOT_ACCEPTING_OFFERS: {
    code: 'JOB_NOT_ACCEPTING_OFFERS',
    message: 'העבודה אינה מקבלת הצעות במצבה הנוכחי',
    status: 409,
  },
  INVALID_TRANSITION: {
    code: 'INVALID_TRANSITION',
    message: 'לא ניתן לבצע את המעבר הזה במצב הנוכחי של העבודה',
    status: 409,
  },
  TRANSITION_NOT_PERMITTED_FOR_ROLE: {
    code: 'FORBIDDEN',
    message: 'אין לך הרשאה לשנות את מצב העבודה כך',
    status: 403,
  },
  ROLE_CHANGE_FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'לא ניתן לשנות הרשאות',
    status: 403,
  },
  VERIFICATION_CHANGE_FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'רק מנהל יכול לשנות מצב אימות',
    status: 403,
  },
  UNAUTHENTICATED: {
    code: 'UNAUTHENTICATED',
    message: 'נדרשת התחברות',
    status: 401,
  },
};

export interface HandlerContext {
  readonly requestId: string;
}

/**
 * Wrap a route handler so every failure produces a structured response and a
 * structured log line, and nothing leaks a stack trace to the client.
 */
export function handler(
  operation: string,
  fn: (context: HandlerContext) => Promise<NextResponse>,
): () => Promise<NextResponse> {
  return async () => {
    const requestId = newRequestId();
    const startedAt = Date.now();
    try {
      const response = await fn({ requestId });
      logOperation({
        requestId,
        operation,
        result: 'ok',
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      return handleError(error, operation, requestId, startedAt);
    }
  };
}

export function handleError(
  error: unknown,
  operation: string,
  requestId: string,
  startedAt = Date.now(),
): NextResponse {
  const durationMs = Date.now() - startedAt;

  if (error instanceof UnauthorizedError) {
    logOperation({ requestId, operation, result: 'denied', errorCode: 'UNAUTHENTICATED', durationMs });
    return fail('UNAUTHENTICATED', error.message, 401, requestId);
  }

  if (error instanceof ForbiddenError) {
    logOperation({ requestId, operation, result: 'denied', errorCode: 'FORBIDDEN', durationMs });
    return fail('FORBIDDEN', error.message, 403, requestId);
  }

  if (error instanceof ApiError) {
    logOperation({ requestId, operation, result: 'invalid', errorCode: error.code, durationMs });
    return fail(error.code, error.message, error.status, requestId, error.details);
  }

  if (error instanceof z.ZodError) {
    logOperation({ requestId, operation, result: 'invalid', errorCode: 'VALIDATION_FAILED', durationMs });
    return fail('VALIDATION_FAILED', 'הנתונים שנשלחו אינם תקינים', 422, requestId, error.issues);
  }

  // Errors raised by our own SQL functions.
  const name = pgErrorName(error);
  if (name && DB_ERROR_MAP[name]) {
    const mapped = DB_ERROR_MAP[name];
    logOperation({ requestId, operation, result: 'invalid', errorCode: mapped.code, durationMs });
    return fail(mapped.code, mapped.message, mapped.status, requestId);
  }

  /*
   * A unique-constraint violation is a statement about the REQUEST, not a
   * fault on our side. Reported as a 500 it reads "something failed on our
   * end" — which is both untrue and useless to the person who just submitted
   * the same thing twice. Named constraints carry their own message; anything
   * else gets a generic conflict rather than a fabricated explanation.
   */
  if (isPgError(error) && error.code === '23505') {
    const mapped = UNIQUE_VIOLATIONS[error.constraint ?? ''];
    logOperation({
      requestId, operation, result: 'invalid',
      errorCode: mapped?.code ?? 'ALREADY_EXISTS',
      durationMs, meta: { constraint: error.constraint ?? 'unknown' },
    });
    return fail(
      mapped?.code ?? 'ALREADY_EXISTS',
      mapped?.message ?? 'הפריט הזה כבר קיים',
      409,
      requestId,
    );
  }

  // RLS refusals and privilege errors must not reveal whether the row exists.
  if (isPgError(error) && error.code === '42501') {
    logOperation({ requestId, operation, result: 'denied', errorCode: 'FORBIDDEN', durationMs });
    return fail('FORBIDDEN', 'אין לך הרשאה לפעולה הזו', 403, requestId);
  }

  const message = error instanceof Error ? error.message : String(error);
  logOperation({
    requestId,
    operation,
    result: 'error',
    errorCode: isPgError(error) ? (error.code ?? null) : 'UNEXPECTED',
    durationMs,
    meta: { message: message.slice(0, 300) },
  });
  return fail('INTERNAL_ERROR', 'משהו נכשל אצלנו. נסו שוב בעוד רגע.', 500, requestId);
}

/** Parse and validate a JSON body, rejecting anything unparseable. */
export async function parseJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError('INVALID_JSON', 'גוף הבקשה אינו JSON תקין', 400);
  }
  return schema.parse(raw);
}

/** Best-effort client identity for rate limiting. */
export function clientKey(request: Request, suffix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'local';
  return `${suffix}:${ip}`;
}
