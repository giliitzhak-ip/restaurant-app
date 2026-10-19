import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth/session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export function apiError(status: number, code: string) {
  return NextResponse.json({ error: code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Route handlers return 401 JSON instead of redirecting. */
export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'unauthorized');
  return user;
}

/**
 * CSRF defence for cookie-authenticated, state-changing route handlers: the request must
 * come from our own origin (browsers always send Origin on cross-origin POSTs).
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) throw new ApiError(403, 'forbidden');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, 'forbidden');
  }
  if (originHost !== host) throw new ApiError(403, 'forbidden');
}

/** Known API errors become JSON responses; anything else is a 500 (and is logged by the caller). */
export function handleApiError(error: unknown) {
  if (error instanceof ApiError) return apiError(error.status, error.code);
  return apiError(500, 'internalError');
}
