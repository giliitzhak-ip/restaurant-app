import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { SyncEngine, type SyncStatus } from '@/lib/sync/engine';
import { reconcilePendingDrafts } from '@/lib/sync/reconcile';
import {
  cachedProfile,
  executeOperation,
  listClients,
  listPestCatalog,
  listProducts,
  listSites,
  listWarningTemplates,
  loadProfile,
  type ClientRow,
  type OrgProfile,
  type PestCatalogRow,
  type ProductRow,
  type SiteRow,
  type WarningTemplateRow,
} from '@/lib/repo';
import { listTextTemplates, type TextTemplateRow } from '@/lib/legacy/repo';
import { fetchServerTime, getSession } from '@/lib/supabase';
import { syncServerTime } from '@/lib/time';
import { clientEnv } from '@/lib/env';

/**
 * ההקשר הגלובלי: פרופיל המשתמש, מנוע הסנכרון ונתוני העזר.
 * נתוני העזר נטענים פעם אחת ונשמרים במטמון המקומי לעבודה ללא קליטה.
 */

export interface ReferenceData {
  clients: ClientRow[];
  sites: SiteRow[];
  products: ProductRow[];
  templates: WarningTemplateRow[];
  pestCatalog: PestCatalogRow[];
  /** ספריות הניסוח של העסק (בנוסף לספריות המובנות). */
  textTemplates: TextTemplateRow[];
}

interface AppContextValue {
  profile: OrgProfile | null;
  loading: boolean;
  authenticated: boolean;
  syncEngine: SyncEngine;
  syncStatus: SyncStatus;
  reference: ReferenceData;
  refreshReference: () => Promise<void>;
  /** עדכון מקומי של ספריות הניסוח אחרי שמירה או מחיקה. */
  setTextTemplates: (rows: TextTemplateRow[]) => void;
  refreshProfile: () => Promise<void>;
  configError: string | null;
}

const emptyReference: ReferenceData = {
  clients: [],
  sites: [],
  products: [],
  templates: [],
  pestCatalog: [],
  textTemplates: [],
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const syncEngine = useMemo(() => new SyncEngine(executeOperation), []);
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [reference, setReference] = useState<ReferenceData>(emptyReference);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'local',
    pendingCount: 0,
    failedCount: 0,
    isOnline: true,
    lastSyncedAt: null,
    lastError: null,
  });
  const configError = clientEnv.isConfigured
    ? null
    : `חסרה הגדרת סביבה: ${clientEnv.missing.join(', ')}. יש ליצור קובץ .env לפי .env.example.`;

  const refreshReference = useCallback(async () => {
    if (!clientEnv.isConfigured) return;
    const [clients, sites, products, templates, pestCatalog, textTemplates] = await Promise.all([
      listClients().catch(() => [] as ClientRow[]),
      listSites().catch(() => [] as SiteRow[]),
      listProducts().catch(() => [] as ProductRow[]),
      listWarningTemplates().catch(() => [] as WarningTemplateRow[]),
      listPestCatalog().catch(() => [] as PestCatalogRow[]),
      listTextTemplates().catch(() => [] as TextTemplateRow[]),
    ]);
    setReference({ clients, sites, products, templates, pestCatalog, textTemplates });
  }, []);

  const setTextTemplates = useCallback((rows: TextTemplateRow[]) => {
    setReference((current) => ({ ...current, textTemplates: rows }));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!clientEnv.isConfigured) {
      setLoading(false);
      return;
    }
    try {
      const session = await getSession();

      if (!session) {
        // ללא קליטה ייתכן שהספרייה אינה מצליחה לאמת את ה-session ומחזירה
        // null. אם יש פרופיל במטמון המקומי — ממשיכים לעבוד: הטיוטות שמורות
        // ב-IndexedDB, והגישה לשרת ממילא חסומה בלי טוקן תקף.
        const offlineProfile = navigator.onLine ? undefined : await cachedProfile();
        if (offlineProfile) {
          setProfile(offlineProfile);
          setAuthenticated(true);
          setLoading(false);
          return;
        }
        setAuthenticated(false);
        setProfile(null);
        setLoading(false);
        return;
      }

      setAuthenticated(true);
      const loaded = await loadProfile();
      // ללא קליטה loadProfile נכשל; ניפול חזרה למטמון בבלוק catch.
      if (loaded) setProfile(loaded);
      else {
        const cached = await cachedProfile();
        if (cached) setProfile(cached);
      }
    } catch {
      // ללא קליטה — נשענים על המטמון המקומי.
      const cached = await cachedProfile();
      if (cached) {
        setProfile(cached);
        setAuthenticated(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribeSync = syncEngine.subscribe(setSyncStatus);
    const stopEngine = syncEngine.start();

    // טיוטות שנשמרו מקומית אך לא הספיקו להיכנס לתור (רענון או סגירה
    // לפני שההשהיה הסתיימה) נכנסות אליו כאן, ושוב כשהחיבור חוזר.
    void reconcilePendingDrafts(syncEngine);
    const handleOnline = () => void reconcilePendingDrafts(syncEngine);
    globalThis.addEventListener('online', handleOnline);

    return () => {
      unsubscribeSync();
      stopEngine();
      globalThis.removeEventListener('online', handleOnline);
    };
  }, [syncEngine]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!profile) return;
    void refreshReference();
    // סנכרון שעון מול השרת — כל חותמות הזמן ביומן מתוקנות לפיו.
    void syncServerTime(fetchServerTime);
  }, [profile, refreshReference]);

  const value = useMemo<AppContextValue>(
    () => ({
      profile,
      loading,
      authenticated,
      syncEngine,
      syncStatus,
      reference,
      refreshReference,
      setTextTemplates,
      refreshProfile,
      configError,
    }),
    [
      profile,
      loading,
      authenticated,
      syncEngine,
      syncStatus,
      reference,
      refreshReference,
      setTextTemplates,
      refreshProfile,
      configError,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp חייב להיות בתוך AppProvider');
  return context;
}
