'use client';

import { useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/client';

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface Options<T extends Record<string, unknown>> {
  table: string;
  filter?: string;
  event?: Event;
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void;
  enabled?: boolean;
}

/**
 * Subscribes to Postgres changes for one table.
 *
 * Supabase Realtime applies the same Row Level Security as a normal query, so a
 * subscription can never deliver a row the user is not allowed to read. This is
 * push-based by design: nothing here polls.
 */
export function useRealtime<T extends Record<string, unknown>>({
  table,
  filter,
  event = '*',
  onChange,
  enabled = true,
}: Options<T>) {
  // Keep the latest callback without re-subscribing on every render. Assigning
  // the ref in an effect rather than during render keeps render pure.
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`realtime:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<T>) => handler.current(payload),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, event, enabled]);
}
