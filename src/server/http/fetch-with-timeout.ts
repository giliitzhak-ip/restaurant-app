/**
 * `fetch` with a deadline.
 *
 * A gateway, an object store or a vision API that stops answering must not
 * hold a Next.js request worker open until the platform kills it. Every
 * outbound call in this app goes through here so the failure mode is a fast,
 * logged error instead of a hung checkout.
 */
export interface TimeoutOptions {
  timeoutMs?: number;
  /** Shows up in logs, so a timeout says which integration stalled. */
  label?: string;
  /** Caller's own signal; aborting it aborts the request too. */
  signal?: AbortSignal;
}

export class RequestTimeout extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "RequestTimeout";
  }
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  options: TimeoutOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const label = options.label ?? "fetch";
  const controller = new AbortController();

  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeout(label, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
