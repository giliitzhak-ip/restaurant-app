'use client';

import { useCallback } from 'react';

/**
 * The floor on a `datetime-local` picker, in the browser's own timezone.
 *
 * This replaces `new Date(...).toISOString().slice(0, 16)`, which was wrong
 * in a way that only shows up outside UTC — which is to say, everywhere this
 * product is used. `toISOString` converts to UTC, but `<input
 * type="datetime-local">` reads and writes LOCAL wall-clock time. In Israel
 * that is a two- or three-hour gap depending on daylight saving, so the
 * picker let a customer choose a time that the server then rejected, or
 * blocked a time that was perfectly valid. Neither is explicable to the
 * person looking at the screen.
 *
 * It is a callback ref rather than a rendered `min` attribute because the
 * value depends on `Date.now()` and on the browser's timezone, neither of
 * which the server knows. Rendering it would mean the server writing one
 * value into the HTML and React finding a different one on hydration — a
 * mismatch that React resolves by discarding the markup. Set after mount, the
 * server renders no `min` at all and there is nothing to disagree about.
 *
 * This is a courtesy, not a rule. The rule is in `POST /api/jobs`, which
 * revalidates the chosen time server-side; a picker can always be bypassed.
 */

/** Default lead time: an hour, matching the floor the API enforces. */
const DEFAULT_LEAD_MINUTES = 60;

/**
 * Format a Date as `YYYY-MM-DDTHH:mm` in LOCAL time.
 *
 * Built from the local getters on purpose. Every shorter spelling of this —
 * `toISOString`, `toJSON`, subtracting the offset first — is either UTC or
 * a subtraction that breaks across a daylight-saving boundary.
 */
export function localDateTimeValue(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}`
  );
}

/** The same, for a `<input type="date">`: `YYYY-MM-DD` in LOCAL time. */
export function localDateValue(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/**
 * A ref for a `<input type="date">` whose floor is today, locally.
 *
 * The document-expiry field set `min={new Date().toISOString().slice(0, 10)}`
 * — the same two mistakes in one expression. It is UTC, so between midnight
 * and 03:00 Israel time it offers YESTERDAY as the earliest allowed date; and
 * it reads the clock during render, which is impure and disagrees between the
 * server's HTML and the browser's hydration.
 */
export function useTodayMinimumRef(): (node: HTMLInputElement | null) => void {
  return useCallback((node: HTMLInputElement | null) => {
    if (!node) return;
    node.min = localDateValue(new Date());
  }, []);
}

/**
 * A ref for a `datetime-local` input that sets `min` once the element exists.
 *
 * The returned callback is stable, so React attaches it on mount and does not
 * churn on re-render. The picker in both flows is mounted only once the
 * customer chooses a specific time, so the clock is read at the moment the
 * field appears rather than when the page was built.
 */
export function useScheduleMinimumRef(
  leadMinutes: number = DEFAULT_LEAD_MINUTES,
): (node: HTMLInputElement | null) => void {
  return useCallback(
    (node: HTMLInputElement | null) => {
      if (!node) return;
      node.min = localDateTimeValue(new Date(Date.now() + leadMinutes * 60_000));
    },
    [leadMinutes],
  );
}
