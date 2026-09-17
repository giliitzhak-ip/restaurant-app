import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { ApiError } from './errors';

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: { message: string; code: string; details?: unknown };
}

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(error: ApiError): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error: { message: error.message, code: error.code, details: error.details },
    },
    { status: error.status },
  );
}

/** Zod issues, flattened into a field → message map the forms can consume. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    if (!result[path]) result[path] = issue.message;
  }
  return result;
}

/**
 * Converts anything thrown inside a route into a safe response. Unexpected
 * errors are logged with their stack and returned as a generic 500.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ApiError) return jsonError(error);

  if (error instanceof ZodError) {
    return jsonError(ApiError.badRequest('יש שדות שדורשים תיקון', fieldErrors(error)));
  }

  // Server-side diagnostics only; the client gets a generic message.
  console.error('[api] unhandled error', error);
  return jsonError(new ApiError(500, 'משהו השתבש. נסה שוב.', 'internal_error'));
}

/** Parses and validates a JSON body, raising a 400 with field errors. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw ApiError.badRequest('גוף הבקשה אינו JSON תקין');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw ApiError.badRequest('יש שדות שדורשים תיקון', fieldErrors(result.error));
  }
  return result.data;
}

/** Parses and validates query string parameters. */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw ApiError.badRequest('פרמטרים לא תקינים', fieldErrors(result.error));
  }
  return result.data;
}
