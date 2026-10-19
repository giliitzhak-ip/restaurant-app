/** Small fetch wrapper for provider adapters: timeouts, JSON, and errors that never leak secrets. */
export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export async function providerFetch<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<T> {
  const { timeoutMs = 60_000, fetchImpl = fetch, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...rest, signal: ctrl.signal });
  } catch (e) {
    throw new ProviderHttpError(`network error: ${(e as Error).message}`, 0, true);
  } finally {
    clearTimeout(t);
  }
  const text = await res.text();
  if (!res.ok) {
    // 429 and 5xx are worth retrying; 4xx means our request is wrong.
    throw new ProviderHttpError(`HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, res.status === 429 || res.status >= 500);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new ProviderHttpError(`invalid JSON from provider: ${text.slice(0, 200)}`, res.status, false);
  }
}
