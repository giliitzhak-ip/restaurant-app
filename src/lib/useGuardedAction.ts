import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * מריץ פעולה פעם אחת גם אם המשתמש לחץ פעמיים.
 *
 * בשטח, עם כפפות ובשמש, לחיצה כפולה היא דבר שכיח; ועל מסך מגע
 * היא מגיעה לעיתים כשני אירועים בתוך פחות מ-100 מילישניות. פעולה
 * שיוצרת רשומה חייבת לרוץ פעם אחת בלבד.
 *
 * החסימה היא ב-ref ולא ב-state, כי עדכון state אינו סינכרוני
 * והלחיצה השנייה הייתה מגיעה לפני שהכפתור הצליח להיות מושבת.
 */
export function useGuardedAction<A extends unknown[] = []>(
  action: (...args: A) => void,
  ms = 1500,
): { run: (...args: A) => void; pending: boolean } {
  const lockedUntil = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const [pending, setPending] = useState(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = useCallback((...args: A) => {
    const now = Date.now();
    if (now < lockedUntil.current) return;
    lockedUntil.current = now + ms;
    setPending(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPending(false), ms);
    action(...args);
  }, [action, ms]);

  return { run, pending };
}
