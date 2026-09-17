'use client';

/** Shape of every error the API returns. */
export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 429 || this.code === 'NETWORK_ERROR';
  }
}

/**
 * Typed fetch wrapper.
 *
 * Distinguishes "the server said no" from "the request never arrived", which
 * the UI needs in order to show an offline state rather than a generic error
 * (spec §43).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...rest.headers,
      },
      body: json === undefined ? rest.body : JSON.stringify(json),
    });
  } catch {
    throw new ApiRequestError(
      'NETWORK_ERROR',
      'אין חיבור לרשת. בדקו את החיבור ונסו שוב.',
      0,
    );
  }

  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const error = (body as { error?: ApiErrorShape } | null)?.error;
    throw new ApiRequestError(
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'משהו נכשל. נסו שוב.',
      response.status,
      error?.details,
    );
  }

  return body as T;
}
