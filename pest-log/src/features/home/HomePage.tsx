import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  FilePen,
  FilePlus2,
  ListChecks,
  Settings,
  SprayCan,
  UserRound,
  Users,
} from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { PoisonNotice, SyncBadge } from '@/components/Common';
import { CircleButton } from '@/components/motion/CircleButton';
import { STAGGER_STEP_MS, prefersReducedMotion } from '@/components/motion/motion';
import { EMPTY_HOME_COUNTERS, loadHomeCounters, type HomeCounters } from '@/lib/repo';
import { newUuid } from '@/lib/ids';
import { SYNC_STATE_LABELS } from '@/schema/enums';

/**
 * מסך הבית.
 *
 * רשת כפתורים עגולים גדולים, ברכה לפי שעה, וסטטוס סנכרון אמיתי.
 * המונים שעל התגים מגיעים מנתונים אמיתיים בלבד — אין מספרי דמה, ותג
 * אינו מוצג כאשר המספר הוא אפס.
 */

/** ברכה לפי שעת היום. */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

/** תיאור מצב הסנכרון במילים קצרות, כפי שמוצג במסך הבית. */
export function syncLabel(state: keyof typeof SYNC_STATE_LABELS): string {
  switch (state) {
    case 'synced':
      return 'מסונכרן';
    case 'pending':
      return 'שומר…';
    case 'local':
      return 'ממתין לחיבור';
    case 'error':
      return 'שגיאת סנכרון';
    default:
      return SYNC_STATE_LABELS[state];
  }
}

const ICON_SIZE = 38;
const ICON_STROKE = 1.8;

interface TileDefinition {
  key: string;
  label: string;
  to: string;
  icon: React.JSX.Element;
  /** תיאור נוסף ל-aria-label. */
  description: string;
  badge?: number;
  badgeMuted?: boolean;
  badgeNoun?: string;
  primary?: boolean;
  onActivate?: () => void;
}

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const { profile, syncStatus } = useApp();
  const [counters, setCounters] = useState<HomeCounters>(EMPTY_HOME_COUNTERS);
  const [loadingCounters, setLoadingCounters] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [entered, setEntered] = useState(prefersReducedMotion());
  const heroRef = useRef<HTMLElement | null>(null);

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);

  // ── מונים אמיתיים ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadHomeCounters();
      if (!cancelled) {
        setCounters(result);
        setLoadingCounters(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // מתרענן גם אחרי סנכרון מוצלח, כדי שהמספרים יישארו נכונים.
  }, [syncStatus.lastSyncedAt]);

  // ── כניסה הדרגתית של הכפתורים ──
  useEffect(() => {
    if (entered) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [entered]);

  // ── אפקט גלילה: כיווץ האזור הירוק והופעת כותרת דביקה ──
  useEffect(() => {
    if (prefersReducedMotion()) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = globalThis.scrollY;
        const hero = heroRef.current;
        if (hero) {
          // transform ו-opacity בלבד — בלי layout, כדי לשמור על 60FPS.
          const shrink = Math.min(y / 140, 1);
          hero.style.transform = `translate3d(0, ${-shrink * 28}px, 0)`;
          const greetingNode = hero.querySelector<HTMLElement>('.home-greeting');
          if (greetingNode) greetingNode.style.opacity = String(Math.max(0, 1 - y / 70));
        }
        // סף נמוך: הרשת נכנסת כמעט במלואה במסך טלפון, ולכן טווח הגלילה
        // קצר. סף גבוה היה מונע מהכותרת הדביקה להופיע בכלל.
        setScrolled(y > 44);
      });
    };

    globalThis.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      globalThis.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const go = useCallback((to: string) => () => navigate(to), [navigate]);

  const tiles: TileDefinition[] = [
    {
      key: 'new-log',
      label: 'יומן חדש',
      to: '',
      description: 'פתיחת יומן ביצוע הדברה חדש',
      icon: <FilePlus2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
      primary: true,
      onActivate: () => navigate(`/logs/${newUuid()}`),
    },
    {
      key: 'drafts',
      label: 'טיוטות',
      to: '/drafts',
      description: 'יומנים שטרם הושלמו',
      icon: <FilePen size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
      badge: counters.drafts,
      badgeNoun: 'טיוטות פתוחות',
    },
    {
      key: 'archive',
      label: 'ארכיון',
      to: '/archive',
      description: 'יומנים שהושלמו, חיפוש והפקת PDF',
      icon: <Archive size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
      badge: counters.archiveThisMonth,
      badgeMuted: true,
      badgeNoun: 'יומנים שהושלמו החודש',
    },
    {
      key: 'clients',
      label: 'לקוחות',
      to: '/clients',
      description: 'מזמיני הדברה ואתרים',
      icon: <Users size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    },
    {
      key: 'products',
      label: 'תכשירים',
      to: '/products',
      description: 'מאגר תכשירי ההדברה',
      icon: <SprayCan size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    },
    {
      key: 'tasks',
      label: 'משימות',
      to: '/tasks',
      description: 'טיפולים משלימים ומעקבים',
      icon: <ListChecks size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
      badge: counters.tasks,
      badgeNoun: 'משימות פתוחות',
    },
    {
      key: 'profile',
      label: 'פרופיל',
      to: '/profile',
      description: 'פרטי המדביר והרישיונות',
      icon: <UserRound size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    },
    {
      key: 'settings',
      label: 'הגדרות',
      to: '/settings',
      description: 'הגדרות העסק, סנכרון ופרטיות',
      icon: <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
    },
  ];

  const organizationName = profile?.organizationName || 'יצחק אחזקות והדברות';

  return (
    <div className="home">
      <a className="skip-link" href="#main-content">
        דילוג לתוכן הראשי
      </a>

      {/* כותרת דביקה קטנה שמופיעה בגלילה */}
      <div className={`home-sticky${scrolled ? ' is-visible' : ''}`} aria-hidden={!scrolled}>
        <span className="brand-mark" aria-hidden="true">
          יה
        </span>
        <span className="home-sticky-name">{organizationName}</span>
      </div>

      <header className="home-hero" ref={heroRef}>
        <div className="home-hero-top">
          <div className="home-logo">
            <span className="home-logo-mark" aria-hidden="true">
              <SprayCan size={24} strokeWidth={1.9} />
            </span>
            <span className="home-org">
              <span className="home-org-name">{organizationName}</span>
              <span className="home-org-sub">יומן ביצוע הדברה</span>
            </span>
          </div>

          <SyncBadge
            state={syncStatus.state}
            pendingCount={syncStatus.pendingCount}
            isOnline={syncStatus.isOnline}
            onHero
            label={syncLabel(syncStatus.state)}
          />
        </div>

        <div className="home-greeting">
          <h1>
            {greeting}
            {profile?.fullName ? `, ${profile.fullName}` : ''}
          </h1>
          <p>מה תרצה לבצע היום?</p>
        </div>
      </header>

      <main className="home-body" id="main-content">
        <PoisonNotice />

        <nav className="home-grid" aria-label="פעולות ראשיות">
          {tiles.map((tile, index) => {
            const badgeText =
              typeof tile.badge === 'number' && tile.badge > 0 ? ` — ${tile.badge} ${tile.badgeNoun ?? ''}`.trimEnd() : '';
            return (
              <CircleButton
                key={tile.key}
                label={tile.label}
                ariaLabel={`${tile.label}. ${tile.description}${badgeText}`}
                icon={tile.icon}
                primary={tile.primary ?? false}
                badge={loadingCounters ? undefined : tile.badge}
                badgeMuted={tile.badgeMuted ?? false}
                enterDelayMs={index * STAGGER_STEP_MS}
                entered={entered}
                testId={`tile-${tile.key}`}
                onActivate={tile.onActivate ?? go(tile.to)}
              />
            );
          })}
        </nav>
      </main>
    </div>
  );
}
