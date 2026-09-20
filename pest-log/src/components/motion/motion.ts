/**
 * עזרי תנועה משותפים.
 *
 * העיקרון: אנימציות ב-transform וב-opacity בלבד, בלי ספריית אנימציות
 * כבדה, וכיבוד מלא של prefers-reduced-motion.
 */

/** האם המשתמש ביקש הפחתת תנועה. */
export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** משך אנימציית הלחיצה. הניווט לא מתעכב מעבר לזה. */
export const PRESS_DURATION_MS = 100;
/** גבול עליון לעיכוב הניווט, גם אם משהו משתבש. */
export const MAX_NAVIGATION_DELAY_MS = 180;
/** השהיית ה-stagger בין כפתורים בכניסה. */
export const STAGGER_STEP_MS = 40;

/**
 * רטט קצר בנייד. פועל רק כשהדפדפן תומך, ולא כשהמשתמש ביקש הפחתת תנועה.
 */
export function tapFeedback(): void {
  if (prefersReducedMotion()) return;
  const vibrate = globalThis.navigator?.vibrate;
  if (typeof vibrate !== 'function') return;
  try {
    // חתימת ה-API מקבלת גם מספר בודד וגם תבנית; TypeScript מצפה לתבנית.
    vibrate.call(globalThis.navigator, [10]);
  } catch {
    // חלק מהדפדפנים חוסמים רטט ללא מחווה — לא קריטי.
  }
}

/**
 * גל לחיצה היוצא מנקודת הלחיצה.
 * מוסיף אלמנט זמני לתוך המכל ומסיר אותו בסיום.
 */
export function spawnRipple(container: HTMLElement, clientX: number, clientY: number): void {
  if (prefersReducedMotion()) return;

  const rect = container.getBoundingClientRect();
  if (rect.width === 0) return;

  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  // כשאין נקודת לחיצה (מקלדת) — מרכז המכל.
  const x = Number.isFinite(clientX) ? clientX - rect.left : rect.width / 2;
  const y = Number.isFinite(clientY) ? clientY - rect.top : rect.height / 2;
  ripple.style.insetInlineStart = 'auto';
  ripple.style.left = `${x - size / 2}px`;
  ripple.style.top = `${y - size / 2}px`;

  container.appendChild(ripple);
  const remove = () => ripple.remove();
  ripple.addEventListener('animationend', remove, { once: true });
  // רשת ביטחון אם האנימציה לא נורתה.
  globalThis.setTimeout(remove, 600);
}

/** ממתין את משך אנימציית הלחיצה, בלי לעכב מעבר לגבול העליון. */
export function waitForPress(): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.min(PRESS_DURATION_MS, MAX_NAVIGATION_DELAY_MS));
  });
}
