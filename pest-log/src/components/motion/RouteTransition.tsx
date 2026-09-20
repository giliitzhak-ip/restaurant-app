import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { prefersReducedMotion } from './motion';

/**
 * מעבר חי בין מסכים, שמירת מיקום הגלילה, ומחוות החלקה לחזרה.
 *
 * - המסך הנכנס מונפש ב-transform וב-opacity בלבד (בלי לרענן את הדף).
 * - כיוון האנימציה מותאם ל-RTL, והחזרה מונפשת בכיוון ההפוך.
 * - מיקום הגלילה נשמר לכל מסך ומשוחזר בחזרה אליו.
 */

/** מיקומי גלילה לפי מפתח הניווט. */
const scrollPositions = new Map<string, number>();

/** אזורים שבהם מחוות ההחלקה מבוטלת (חתימה, גלילה אופקית, מפה). */
const NO_SWIPE_SELECTOR = '[data-no-swipe], canvas, .table-scroll, .stepper, .combo-list, input[type="range"]';

/** רוחב אזור הקצה שממנו מתחילה מחוות החזרה. */
const EDGE_WIDTH_PX = 28;
/** מרחק אופקי מינימלי כדי שהמחווה תיחשב. */
const SWIPE_DISTANCE_PX = 64;
/** סטייה אנכית מקסימלית — מעבר לזה מדובר בגלילה. */
const SWIPE_VERTICAL_TOLERANCE_PX = 44;

export function RouteTransition({ children }: { children: ReactNode }): React.JSX.Element {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousKey = useRef(location.key);
  const [animationClass, setAnimationClass] = useState('');

  // שמירת מיקום הגלילה של המסך היוצא, לפני שהחדש מצויר.
  useLayoutEffect(() => {
    const leavingKey = previousKey.current;
    if (leavingKey !== location.key) {
      scrollPositions.set(leavingKey, globalThis.scrollY);
      previousKey.current = location.key;
    }
  }, [location.key]);

  // שחזור גלילה + בחירת כיוון האנימציה.
  useLayoutEffect(() => {
    const isBack = navigationType === 'POP';
    setAnimationClass(prefersReducedMotion() ? '' : isBack ? 'enter-back' : 'enter-forward');

    const saved = scrollPositions.get(location.key);
    // בחזרה משחזרים את המיקום; במעבר קדימה מתחילים מלמעלה.
    globalThis.scrollTo({ top: isBack && saved !== undefined ? saved : 0, behavior: 'auto' });
  }, [location.key, navigationType]);

  // ניקוי מחלקת האנימציה בסיומה, כדי שלא תישאר על האלמנט.
  useEffect(() => {
    if (!animationClass) return;
    const node = containerRef.current;
    if (!node) return;
    const clear = () => setAnimationClass('');
    node.addEventListener('animationend', clear, { once: true });
    return () => node.removeEventListener('animationend', clear);
  }, [animationClass]);

  // ── מחוות החלקה לחזרה ──
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;

      // ביטול באזורים שבהם המחווה מתנגשת עם חתימה או גלילה אופקית.
      const target = event.target as Element | null;
      if (target?.closest(NO_SWIPE_SELECTOR)) return;

      // ב-RTL קצה ההתחלה הוא הקצה הימני של המסך.
      const fromStartEdge = touch.clientX > globalThis.innerWidth - EDGE_WIDTH_PX;
      if (!fromStartEdge) return;

      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = startX - touch.clientX; // גרירה שמאלה = חיובי
      const deltaY = Math.abs(touch.clientY - startY);
      if (deltaX > SWIPE_DISTANCE_PX && deltaY < SWIPE_VERTICAL_TOLERANCE_PX) {
        navigate(-1);
      }
    };

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchend', onTouchEnd);
    };
  }, [navigate]);

  return (
    <div ref={containerRef} className={`route-view ${animationClass}`.trim()} key={location.key}>
      {children}
    </div>
  );
}
