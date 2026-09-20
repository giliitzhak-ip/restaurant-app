"use client";

import * as React from "react";

/**
 * Whether a media query currently matches.
 *
 * Used where CSS cannot do the job: hiding an element with `lg:hidden` still
 * mounts it, and the room designer's panels are not cheap — the object
 * library alone is forty images and a search index. Rendering them twice, in
 * a visible sheet and an invisible column, costs that twice and puts two
 * elements with the same test id in the document.
 *
 * `useSyncExternalStore` rather than an effect, so the first client render
 * already has the right answer instead of flashing the wrong shell. The
 * server renders the desktop branch, which is the safe default: a column
 * beside the room degrades to a long page without JavaScript, where a sheet
 * that never opens degrades to nothing.
 */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => (typeof window === "undefined" ? true : window.matchMedia(query).matches),
    () => true,
  );
}
