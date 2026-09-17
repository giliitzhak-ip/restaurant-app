import type { ZodError } from 'zod';

/** Flattens Zod issues into a `{ field: message }` map for form rendering. */
export function fieldErrorsOf(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** Reads a typed JSON response from our API, raising the API's message. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: { message: string; details?: unknown } }
    | null;

  if (!payload) throw new Error('משהו השתבש. נסה שוב.');
  if (!payload.ok) {
    const error = new Error(payload.error.message) as Error & { details?: unknown };
    error.details = payload.error.details;
    throw error;
  }
  return payload.data;
}

export async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: { message: string; details?: unknown } }
    | null;
  if (!payload) throw new Error('משהו השתבש. נסה שוב.');
  if (!payload.ok) {
    const error = new Error(payload.error.message) as Error & { details?: unknown };
    error.details = payload.error.details;
    throw error;
  }
  return payload.data;
}
