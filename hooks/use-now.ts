'use client';

import { useSyncExternalStore } from 'react';

const TICK_MS = 30_000;

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
}

/**
 * The current time as a reactive value.
 *
 * Reading `Date.now()` during render is impure and makes a component's output
 * depend on when React happens to re-run it. Going through an external store
 * keeps render pure, gives the server a stable snapshot, and has the bonus that
 * anything derived from it (an offer expiring, a countdown) updates on its own.
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => Date.now(),
    // Server snapshot: nothing is "expired" until the client hydrates.
    () => 0,
  );
}
