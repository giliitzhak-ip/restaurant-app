import { useCallback, useEffect, useState } from 'react';
import { cachedRouteBundle, loadRouteBundle } from '@/lib/routes/repo';
import type { RouteBundle } from '@/lib/routes/types';

/**
 * טעינת מסלול אחד.
 * מנסה מהשרת, ונופל למטמון המקומי כשאין קליטה — כך שמסלול שהורד מראש
 * זמין במלואו גם בשטח בלי רשת.
 */
export interface RouteBundleState {
  bundle: RouteBundle | null;
  loading: boolean;
  offline: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** עדכון מקומי מיידי אחרי פעולה, בלי לחכות לשרת. */
  apply: (updater: (bundle: RouteBundle) => RouteBundle) => void;
}

export function useRouteBundle(routeId: string | undefined): RouteBundleState {
  const [bundle, setBundle] = useState<RouteBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!routeId) return;
    setLoading(true);
    try {
      setBundle(await loadRouteBundle(routeId));
      setOffline(false);
      setError(null);
    } catch (loadError) {
      const cached = await cachedRouteBundle(routeId);
      if (cached) {
        setBundle(cached);
        setOffline(true);
        setError(null);
      } else {
        setError(loadError instanceof Error ? loadError.message : 'טעינת המסלול נכשלה');
      }
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const apply = useCallback((updater: (current: RouteBundle) => RouteBundle) => {
    setBundle((current) => (current ? updater(current) : current));
  }, []);

  return { bundle, loading, offline, error, reload, apply };
}
