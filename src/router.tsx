import { useEffect, useState } from 'react';

/** ניתוב מבוסס hash – עובד גם כקובץ סטטי וגם כ-PWA במצב לא מקוון. */

export function currentRoute(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw === '' ? '/' : raw;
}

export function navigate(to: string): void {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

export function useRoute(): string {
  const [route, setRoute] = useState(() =>
    typeof window === 'undefined' ? '/' : currentRoute(),
  );
  useEffect(() => {
    const onChange = (): void => {
      setRoute(currentRoute());
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** מפענח נתיב כמו /journal/jrn_123/3 */
export function matchRoute(route: string): { name: string; params: string[] } {
  const parts = route.split('/').filter(Boolean);
  return { name: parts[0] ?? '', params: parts.slice(1) };
}
