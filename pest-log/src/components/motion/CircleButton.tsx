import { useCallback, useRef, useState, type ReactNode } from 'react';
import { spawnRipple, tapFeedback, waitForPress } from './motion';

/**
 * כפתור עגול גדול למסך הבית.
 *
 * כל כפתור הוא `<button>` אמיתי עם aria-label בעברית, ולכן עובד גם
 * בניווט מקלדת. אנימציית הלחיצה היא transform ו-opacity בלבד, והניווט
 * מתבצע אחריה בלי לעכב אותו.
 */

export interface CircleButtonProps {
  label: string;
  /** תיאור נגיש מלא — כולל משמעות התג, אם יש. */
  ariaLabel: string;
  icon: ReactNode;
  onActivate: () => void | Promise<void>;
  /** מספר להצגה בתג. 0 או undefined — אין תג. */
  badge?: number | undefined;
  /** תג משני (למשל ספירת יומנים מהחודש) בצבע רגוע יותר. */
  badgeMuted?: boolean;
  /** נקודה אדומה קטנה להתראה (למשל ביקור דחוף או באיחור). */
  alertDot?: boolean;
  /** הפעולה הראשית — מקבלת טבעת והדגשה. */
  primary?: boolean;
  /** השהיית הכניסה, ליצירת stagger. */
  enterDelayMs?: number;
  /** האם הכפתור כבר נכנס לתצוגה. */
  entered?: boolean;
  disabled?: boolean;
  testId?: string;
}

export function CircleButton({
  label,
  ariaLabel,
  icon,
  onActivate,
  badge,
  badgeMuted = false,
  alertDot = false,
  primary = false,
  enterDelayMs = 0,
  entered = true,
  disabled = false,
  testId,
}: CircleButtonProps): React.JSX.Element {
  const circleRef = useRef<HTMLSpanElement | null>(null);
  const [pressed, setPressed] = useState(false);
  // מונע פתיחה כפולה של אותו מסך בלחיצה מהירה כפולה.
  const busyRef = useRef(false);

  const activate = useCallback(
    async (clientX: number, clientY: number) => {
      if (busyRef.current || disabled) return;
      busyRef.current = true;

      if (circleRef.current) spawnRipple(circleRef.current, clientX, clientY);
      tapFeedback();
      setPressed(true);

      await waitForPress();
      setPressed(false);

      try {
        await onActivate();
      } finally {
        // שחרור מאוחר מעט, כדי שלחיצה כפולה מהירה לא תפתח פעמיים.
        globalThis.setTimeout(() => {
          busyRef.current = false;
        }, 250);
      }
    },
    [disabled, onActivate],
  );

  const showBadge = typeof badge === 'number' && badge > 0;

  return (
    <button
      type="button"
      className={`home-tile${primary ? ' is-primary' : ''}${pressed ? ' is-pressed' : ''}${entered ? ' is-in' : ''}`}
      style={{ transitionDelay: entered ? `${enterDelayMs}ms` : '0ms' }}
      aria-label={ariaLabel}
      disabled={disabled}
      data-testid={testId ?? undefined}
      onPointerDown={(event) => {
        // הצגת מצב הלחיצה מיד למגע, לפני ה-click.
        if (!busyRef.current && !disabled) setPressed(true);
        if (circleRef.current) spawnRipple(circleRef.current, event.clientX, event.clientY);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={(event) => {
        void activate(event.clientX, event.clientY);
      }}
    >
      {/*
        התג ונקודת ההתראה הם אחים של העיגול ולא ילדיו: העיגול חייב
        overflow: hidden בשביל גל הלחיצה, והוא היה חותך אותם.
      */}
      <span className="home-tile-figure">
        <span className="home-tile-circle" ref={circleRef}>
          <span className="home-tile-icon" aria-hidden="true">
            {icon}
          </span>
        </span>
        {alertDot ? <span className="home-tile-alert" aria-hidden="true" /> : null}
        {showBadge ? (
          <span className={`home-tile-badge${badgeMuted ? ' is-muted' : ''}`} aria-hidden="true">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span className="home-tile-label">{label}</span>
    </button>
  );
}
