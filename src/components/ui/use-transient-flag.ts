"use client";

import * as React from "react";

/**
 * A boolean that turns itself off again.
 *
 * Every "it worked" tick in the interface is temporary — the point is to
 * confirm the last click, not to leave a permanent badge on the control. This
 * holds the flag for `ms` and clears it, cancelling a pending timer if the
 * action is repeated and on unmount, so a button that disappears mid-flight
 * does not try to set state afterwards.
 */
export function useTransientFlag(ms = 1400) {
  const [on, setOn] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const fire = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);

  return [on, fire] as const;
}
