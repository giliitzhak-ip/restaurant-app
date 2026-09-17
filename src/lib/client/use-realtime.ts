'use client';

import { useEffect, useRef, useState } from 'react';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'offline';

export interface RealtimeOptions {
  /** Channels to react to; others are ignored. */
  readonly channels?: readonly string[];
  /**
   * Called whenever something relevant changed. Implementations should
   * REFETCH authoritative state rather than trusting the event payload
   * (spec §22, §24).
   */
  readonly onChange: (channel: string, payload: Record<string, unknown>) => void;
  readonly enabled?: boolean;
}

/**
 * Subscribe to the server event stream.
 *
 * The contract is deliberately narrow: events are hints, never data. Every
 * handler refetches through the API, so a missed or dropped event costs one
 * extra fetch and never leaves the UI wrong.
 *
 * EventSource reconnects by itself; on each reconnect the server sends
 * `ready`, which triggers a fresh authoritative fetch. That is what makes a
 * disconnect non-fatal (spec §44).
 */
export function useRealtime({ channels, onChange, enabled = true }: RealtimeOptions): {
  connection: ConnectionState;
} {
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  // Kept in a ref so a changing callback does not tear down the stream.
  // Assigned in an effect rather than during render: mutating a ref while
  // rendering is not safe under concurrent rendering.
  const handlerRef = useRef(onChange);
  useEffect(() => {
    handlerRef.current = onChange;
  });

  const channelKey = channels?.join(',') ?? '';

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource('/api/events');
    const watched = channelKey ? new Set(channelKey.split(',')) : null;
    let opened = false;

    const handle = (channel: string) => (event: MessageEvent<string>) => {
      if (watched && !watched.has(channel)) return;
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      handlerRef.current(channel, payload);
    };

    source.addEventListener('open', () => {
      opened = true;
      setConnection('open');
    });

    // Server says hello on connect AND on every reconnect: refetch.
    source.addEventListener('ready', (event) => {
      setConnection('open');
      handle('ready')(event as MessageEvent<string>);
    });

    for (const channel of [
      'gs_job_change',
      'gs_offer_change',
      'gs_provider_location',
      'gs_notification',
    ]) {
      source.addEventListener(channel, handle(channel));
    }

    source.addEventListener('error', () => {
      // EventSource retries on its own; surface it so the UI can say so.
      setConnection(opened ? 'reconnecting' : 'offline');
    });

    const onOnline = () => setConnection('reconnecting');
    const onOffline = () => setConnection('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      source.close();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [enabled, channelKey]);

  return { connection };
}

/**
 * Poll as a safety net.
 *
 * Realtime is an optimisation, not a dependency: even with the stream down,
 * a slow poll keeps the UI converging on the truth.
 */
export function usePolling(fn: () => void, intervalMs: number, enabled = true): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
}
