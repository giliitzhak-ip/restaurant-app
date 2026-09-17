'use client';

import { useCallback, useEffect, useState } from 'react';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message: string; code: string; details?: unknown };
}

interface State<T> {
  data: T | null;
  error: string | null;
  /** False until the first response for the current url has landed. */
  settled: boolean;
}

/** Performs the request and translates it into the next state, or null if aborted. */
async function fetchApi<T>(url: string, signal: AbortSignal): Promise<State<T> | null> {
  try {
    const response = await fetch(url, { signal });
    const payload = (await response.json()) as ApiEnvelope<T>;

    if (!payload.ok) {
      return { data: null, error: payload.error?.message ?? 'שגיאה', settled: true };
    }
    return { data: payload.data ?? null, error: null, settled: true };
  } catch (error) {
    // An aborted request was superseded; it is not a failure to report.
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    return { data: null, error: 'משהו השתבש. נסה שוב.', settled: true };
  }
}

/**
 * Fetches from our API and unwraps the `{ ok, data | error }` envelope.
 *
 * The effect subscribes to an external system (the network) and only writes
 * state from the response callback, so render stays pure and no synchronous
 * cascade is triggered. Changing the url — or calling `reload` — restarts the
 * request and aborts whatever was in flight.
 */
export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, settled: !url });
  const [reloadToken, setReloadToken] = useState(0);
  const [trackedUrl, setTrackedUrl] = useState(url);

  // Supported "adjust state when the input changes" pattern: resetting here is
  // what makes `loading` true again the moment the url changes.
  if (trackedUrl !== url) {
    setTrackedUrl(url);
    setState({ data: null, error: null, settled: !url });
  }

  useEffect(() => {
    if (!url) return;

    const controller = new AbortController();
    void fetchApi<T>(url, controller.signal).then((next) => {
      if (next) setState(next);
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadToken, ...deps]);

  const reload = useCallback(async () => {
    setReloadToken((token) => token + 1);
  }, []);

  return { data: state.data, error: state.error, loading: !state.settled, reload };
}
