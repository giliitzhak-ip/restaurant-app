import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type {
  AppState, AuditEntry, BaitStationRecord, Customer, CustomerSite, CustomerTemplate, Exterminator,
  FullJournal, ID, Journal, JournalAction, JournalMaterial, JournalPest, Material,
  MaterialLabel, Route, RouteStop, Signature, Task, TreatmentTemplate, Attachment,
  JournalSnapshot,
} from '../types';
import { seedState } from './seed';
import { kvGet, kvSet } from '../lib/storage';
import { syncQueue, startSyncWatchers, type RejectedOp } from '../lib/sync';
import {
  diffSnapshots, mergePulled, snapshotState, type SyncSnapshot,
} from './syncMap';
import { newId } from '../lib/id';
import { isoNow } from '../lib/format';
import { buildJournalSnapshot, fullJournalFromState } from '../lib/snapshot';
import { isJournalLocked } from '../lib/journalLock';
import { buildBackup, mergeBackup, type BackupFile, type ImportPlan } from '../lib/backup';
import { blockingIssues, validateJournal } from '../lib/validation';

const STATE_KEY = 'app-state-v1';

/** מפתח האחסון המקומי, מופרד לפי משתמש כדי שלא יתערבבו נתונים במכשיר משותף. */
function stateKeyFor(scope?: string): string {
  return scope ? `${STATE_KEY}:${scope}` : STATE_KEY;
}

/**
 * 'saved' מוצג רק אחרי כתיבה מאושרת לאחסון קבוע.
 * 'failed' מציין שהנתונים נמצאים בזיכרון בלבד וייעלמו עם סגירת הכרטיסייה.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

interface StoreValue {
  state: AppState;
  saveState: SaveState;
  /** פירוט כשל השמירה, להצגה ולניסיון חוזר. */
  saveErrors: string[];
  retrySave: () => Promise<void>;
  pendingSync: number;
  online: boolean;
  ready: boolean;
  /** שינויים שהשרת דחה מטעמי תוכן. אינם נזרקים ואינם מוסתרים. */
  syncRejected: RejectedOp[];
  retrySync: () => Promise<void>;
  dismissSyncRejection: (opId: string) => Promise<void>;
  /** מושך שינויים מהשרת וממזג אותם. מחזיר את מספר השינויים שהוחלו. */
  pullFromServer: () => Promise<number>;

  /* מדביר */
  updateExterminator: (id: ID, patch: Partial<Exterminator>) => void;

  /* לקוחות */
  createCustomer: (draft: Omit<Customer, 'id' | 'customerNumber' | 'createdAt' | 'updatedAt'>) => Customer;
  updateCustomer: (id: ID, patch: Partial<Customer>) => void;
  createSite: (draft: Omit<CustomerSite, 'id'>) => CustomerSite;

  /* יומן */
  createJournal: () => Journal;
  updateJournal: (id: ID, patch: Partial<Journal>) => void;
  /** מחזיר true רק אם היומן נסגר בפועל. */
  completeJournal: (id: ID) => boolean;
  cancelJournal: (id: ID, reason: string) => void;
  duplicateJournal: (id: ID) => Journal | null;
  loadFromLastJournal: (journalId: ID, customerId: ID) => { copied: string[]; cleared: string[] } | null;

  /* מזיקים ופעולות */
  setJournalPest: (journalId: ID, pestId: string, patch?: Partial<JournalPest>) => void;
  removeJournalPest: (journalId: ID, pestId: string) => void;
  toggleJournalAction: (journalId: ID, kind: JournalAction['kind']) => void;
  updateJournalAction: (id: ID, patch: Partial<JournalAction>) => void;

  /* חומרים ביומן */
  selectMaterial: (journalId: ID, material: Material, templateId?: ID) => JournalMaterial;
  replaceJournalMaterial: (journalMaterialId: ID, material: Material, templateId?: ID) => void;
  updateJournalMaterial: (id: ID, patch: Partial<JournalMaterial>) => void;
  removeJournalMaterial: (id: ID) => void;

  /* תיבות, חתימות, קבצים */
  upsertBaitStation: (rec: Omit<BaitStationRecord, 'id'> & { id?: ID }) => void;
  removeBaitStation: (id: ID) => void;
  saveSignature: (sig: Omit<Signature, 'id'>) => void;
  removeSignature: (journalId: ID, role: Signature['role']) => void;
  addAttachment: (att: Omit<Attachment, 'id' | 'createdAt'>) => void;
  removeAttachment: (id: ID) => void;

  /* תבניות */
  saveCustomerTemplate: (tpl: Omit<CustomerTemplate, 'id' | 'createdAt'>) => CustomerTemplate;
  updateTreatmentTemplate: (id: ID, patch: Partial<TreatmentTemplate>) => void;
  duplicateTreatmentTemplate: (id: ID) => void;
  archiveTreatmentTemplate: (id: ID) => void;
  archiveCustomerTemplate: (id: ID) => void;

  /* מסלול ומשימות */
  createRoute: (draft: Omit<Route, 'id' | 'createdAt'>) => Route;
  addRouteStop: (routeId: ID, customerId: ID, siteId?: ID) => void;
  updateRouteStop: (id: ID, patch: Partial<RouteStop>) => void;
  moveRouteStop: (routeId: ID, stopId: ID, direction: -1 | 1) => void;
  reorderRouteStops: (routeId: ID, orderedStopIds: ID[]) => void;
  removeRouteStop: (id: ID) => void;
  createTask: (draft: Omit<Task, 'id' | 'createdAt'>) => Task;
  updateTask: (id: ID, patch: Partial<Task>) => void;

  /* גיבוי */
  /** מייצר קובץ גיבוי של נתוני המכשיר. */
  exportBackup: () => BackupFile;
  /** ממזג גיבוי בלי לדרוס תיעוד קיים. מחזיר מה נוסף ומה דולג. */
  importBackup: (file: BackupFile) => ImportPlan;

  /* עזר */
  getFullJournal: (id: ID) => FullJournal | null;
  /** הצילום שנלקח בעת סיום היומן, אם נלקח. המסמך מופק ממנו. */
  getJournalSnapshot: (id: ID) => JournalSnapshot | undefined;
  /** האם היומן נעול לעריכה (הושלם או נשלח). */
  isLocked: (id: ID) => boolean;
  labelFor: (materialId: ID) => MaterialLabel | undefined;
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** נתוני ביצוע ריקים – נוצרים מחדש בכל יומן ואף פעם לא מגיעים מתבנית. */
export function emptyExecution(): JournalMaterial['execution'] {
  return {
    batchNumber: '',
    packageExpiry: '',
    chosenDoseId: undefined,
    chosenDoseText: '',
    materialAmount: '',
    waterAmount: '',
    coverage: '',
    coverageUnit: 'sqm',
  };
}

export function StoreProvider({ children, scope }: { children: ReactNode; scope?: string }) {
  const storageKey = stateKeyFor(scope);
  const [state, setState] = useState<AppState>(() => seedState());
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncRejected, setSyncRejected] = useState<RejectedOp[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const loadedRef = useRef(false);
  const stateRef = useRef<AppState>(state);
  /* צילום המצב שכבר נרשם בתור הסנכרון. null = עוד לא נקבע קו בסיס. */
  const syncedRef = useRef<SyncSnapshot | null>(null);
  const lastPullRef = useRef(0);

  /* טעינה ראשונית מהאחסון המקומי */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await kvGet<AppState>(storageKey);
      if (!cancelled && stored) {
        // מיזוג מאגר החומרים והתבניות של המערכת כדי שעדכוני קוד יגיעו למשתמש קיים
        const seeded = seedState();
        const materials = [...seeded.materials];
        for (const m of stored.materials ?? []) {
          if (!materials.some((x) => x.id === m.id)) materials.push(m);
        }
        const labels = [...seeded.materialLabels];
        for (const l of stored.materialLabels ?? []) {
          if (!labels.some((x) => x.id === l.id)) labels.push(l);
        }
        const templates = [...seeded.treatmentTemplates];
        for (const t of stored.treatmentTemplates ?? []) {
          if (!templates.some((x) => x.id === t.id)) templates.push(t);
        }
        setState({ ...seeded, ...stored, materials, materialLabels: labels, treatmentTemplates: templates });
      }
      if (!cancelled) {
        loadedRef.current = true;
        setReady(true);
      }
    })();
    startSyncWatchers();
    const unsub = syncQueue.subscribe((status) => {
      setPendingSync(status.pending);
      setOnline(status.online);
      setSyncRejected(status.rejected);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [storageKey]);

  /* שמירה אוטומטית משוהה – בלי toast בכל שדה */
  useEffect(() => {
    if (!ready || !loadedRef.current) return;
    stateRef.current = state;
    setSaveState('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void kvSet(storageKey, state).then((outcome) => {
        setSaveState(outcome.durable ? 'saved' : 'failed');
        setSaveErrors(outcome.durable ? [] : outcome.errors);
      });
    }, 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [state, ready, storageKey]);

  /**
   * רישום כל שינוי בתור הסנכרון, נגזר מהפרש המצב.
   *
   * זה רץ אחרי שהמצב התקבע, ולכן אינו תלוי בכך שכל פעולה בחנות תזכור
   * לשלוח בעצמה, ואינו נרשם פעמיים כשריאקט מריץ מעדכן פעמיים (StrictMode).
   * פעולה שנרשמה כבר מאוחדת בתור לפי ישות ומזהה, ולכן רישום חוזר של
   * אותה רשומה אינו יוצר פעולה נוספת.
   */
  useEffect(() => {
    if (!ready || !loadedRef.current) return;
    const snapshot = snapshotState(state);
    const base = syncedRef.current;
    syncedRef.current = snapshot;
    // הטעינה הראשונה אינה שינוי של המשתמש ואינה נשלחת לשרת
    if (!base) return;
    const { upserts, deletes } = diffSnapshots(base, snapshot);
    for (const { entity, id, record } of upserts) void syncQueue.enqueue(entity, id, record);
    for (const { entity, id } of deletes) void syncQueue.enqueueDelete(entity, id);
  }, [state, ready]);

  /**
   * משיכת שינויים מהשרת אל המכשיר. בלעדיה מכשיר שני לא רואה מה נעשה
   * במכשיר הראשון, ומחיקה לא מגיעה אליו כלל.
   *
   * שינוי מקומי שעדיין ממתין בתור גובר, כדי שלא יימחק מידע שהוקלד בשטח.
   */
  const pullFromServer = useCallback<StoreValue['pullFromServer']>(async () => {
    let applied = 0;
    lastPullRef.current = Date.now();
    // דף חלקי: ממשיכים מאותה נקודה. התקרה מונעת לופ אם השרת חוזר על עצמו.
    for (let page = 0; page < 20; page += 1) {
      const pulled = await syncQueue.pull();
      if (!pulled) break;
      setState((s) => {
        const outcome = mergePulled(s, pulled, (entity, id) => syncQueue.hasPending(entity, id));
        const changed = outcome.added + outcome.updated + outcome.removed;
        if (changed === 0) return s;
        applied += changed;
        /* המצב שהגיע מהשרת כבר נמצא בשרת, ולכן הוא נכנס לקו הבסיס
           ואינו נשלח בחזרה כשינוי חדש. */
        if (syncedRef.current) syncedRef.current = snapshotState(outcome.state);
        return outcome.state;
      });
      await syncQueue.writeCursor(pulled.cursor);
      if (!pulled.truncated) break;
    }
    return applied;
  }, []);

  const retrySync = useCallback<StoreValue['retrySync']>(async () => {
    await syncQueue.retryRejected();
  }, []);

  const dismissSyncRejection = useCallback<StoreValue['dismissSyncRejection']>(async (opId) => {
    await syncQueue.dismissRejection(opId);
  }, []);

  /**
   * מתי מושכים מהשרת: בפתיחה, בחזרה לחזית, במעבר בין מסכים ובמרווחים קבועים.
   * המעבר בין מסכים חסום בזמן מינימלי, כדי שדפדוף מהיר לא יהפוך לרעש רשת.
   */
  useEffect(() => {
    if (!ready) return;
    void pullFromServer();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void pullFromServer();
    };
    const onNavigate = (): void => {
      if (Date.now() - lastPullRef.current > 10000) void pullFromServer();
    };
    const timer = window.setInterval(() => void pullFromServer(), 60000);
    window.addEventListener('online', onVisible);
    window.addEventListener('hashchange', onNavigate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('hashchange', onNavigate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, pullFromServer]);

  /**
   * סגירת האפליקציה או מעבר לרקע מיד אחרי שינוי עלולים לתפוס את השמירה
   * באמצע ההשהיה. כאן מאלצים כתיבה מיידית כדי שלא ייאבד שינוי אחרון בשטח.
   */
  useEffect(() => {
    const flush = (): void => {
      window.clearTimeout(saveTimer.current);
      if (loadedRef.current) void kvSet(storageKey, stateRef.current);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [storageKey]);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? state.users[0],
    [state.users, state.currentUserId],
  );

  const audit = useCallback(
    (entry: Omit<AuditEntry, 'id' | 'at' | 'userId' | 'userName'>): AuditEntry => ({
      ...entry,
      id: newId('aud'),
      at: isoNow(),
      userId: currentUser?.id ?? 'usr_unknown',
      userName: currentUser?.name ?? '—',
    }),
    [currentUser],
  );

  /**
   * שומר על יומן נעול: פעולה על יומן שהושלם אינה משנה דבר.
   * זו הגנה במצב עצמו, ולא רק בממשק, כדי שגם מסך או קישור ישן
   * לא יוכלו לערוך תיעוד שנמסר ללקוח.
   */
  const lockedJournal = (s: AppState, journalId: ID | undefined): boolean =>
    isJournalLocked(s.journals.find((j) => j.id === journalId));

  /* ───────── מדביר ───────── */

  const updateExterminator = useCallback<StoreValue['updateExterminator']>(
    (id, patch) => {
      setState((s) => {
        const exterminators = s.exterminators.map((e) => (e.id === id ? { ...e, ...patch } : e));
        return { ...s, exterminators };
      });
    },
    [],
  );

  /* ───────── לקוחות ───────── */

  const createCustomer = useCallback<StoreValue['createCustomer']>(
    (draft) => {
      const now = isoNow();
      const customer: Customer = {
        ...draft,
        id: newId('cus'),
        customerNumber: String(1000 + state.counters.customerNumber),
        createdAt: now,
        updatedAt: now,
      };
      setState((s) => ({
        ...s,
        customers: [...s.customers, customer],
        counters: { ...s.counters, customerNumber: s.counters.customerNumber + 1 },
        auditLog: [...s.auditLog, audit({ entity: 'customers', entityId: customer.id, action: 'create' })],
      }));
      return customer;
    },
    [state.counters.customerNumber, audit],
  );

  const updateCustomer = useCallback<StoreValue['updateCustomer']>(
    (id, patch) => {
      setState((s) => {
        const customers = s.customers.map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: isoNow() } : c,
        );
        return {
          ...s,
          customers,
          auditLog: [...s.auditLog, audit({ entity: 'customers', entityId: id, action: 'update' })],
        };
      });
    },
    [audit],
  );

  const createSite = useCallback<StoreValue['createSite']>(
    (draft) => {
      const site: CustomerSite = { ...draft, id: newId('sit') };
      setState((s) => ({ ...s, sites: [...s.sites, site] }));
      return site;
    },
    [],
  );

  /* ───────── יומן ───────── */

  const createJournal = useCallback<StoreValue['createJournal']>(() => {
    const ext = state.exterminators[0];
    const now = isoNow();
    const journal: Journal = {
      id: newId('jrn'),
      journalNumber: state.counters.journalNumber,
      status: 'draft',
      startedAt: now,
      workKind: 'private',
      visitKind: 'new',
      exterminatorId: ext?.id ?? 'ext_yizhak',
      exterminatorName: ext?.name ?? 'יצחק',
      licenseNumber: ext?.licenseNumber ?? '',
      preTreatmentActions: [],
      preventionRecommendations: [],
      warrantyKind: 'none',
      customerAcknowledged: false,
      createdAt: now,
      updatedAt: now,
      lastStep: 1,
    };
    setState((s) => ({
      ...s,
      journals: [...s.journals, journal],
      counters: { ...s.counters, journalNumber: s.counters.journalNumber + 1 },
      auditLog: [...s.auditLog, audit({ entity: 'journals', entityId: journal.id, action: 'create' })],
    }));
    return journal;
  }, [state.exterminators, state.counters.journalNumber, audit]);

  const updateJournal = useCallback<StoreValue['updateJournal']>(
    (id, patch) => {
      setState((s) => {
        const before = s.journals.find((j) => j.id === id);
        if (!before) return s;
        // יומן שהושלם אינו נערך. ביטול מתועד נעשה ב-cancelJournal.
        if (isJournalLocked(before)) return s;
        const after = { ...before, ...patch, updatedAt: isoNow() };
        const entries: AuditEntry[] = [];
        if (before.status === 'completed' || before.status === 'sent') {
          for (const key of Object.keys(patch) as (keyof Journal)[]) {
            if (String(before[key]) !== String(after[key])) {
              entries.push(
                audit({
                  entity: 'journals', entityId: id, action: 'update', field: String(key),
                  before: String(before[key] ?? ''), after: String(after[key] ?? ''),
                }),
              );
            }
          }
        }
        return {
          ...s,
          journals: s.journals.map((j) => (j.id === id ? after : j)),
          auditLog: entries.length ? [...s.auditLog, ...entries] : s.auditLog,
        };
      });
    },
    [audit],
  );

  /**
   * סיום יומן: עובר את אותה ולידציה שבמסך (ולא מסתמך על כך שהכפתור
   * היה מושבת), ולוקח צילום בלתי-משתנה של המסמך שנמסר ללקוח.
   * מחזיר false כשחסרים נתונים, כדי שהמסך לא יציג "נשמר" בלי שנשמר.
   */
  const completeJournal = useCallback<StoreValue['completeJournal']>(
    (id) => {
      const journal = state.journals.find((x) => x.id === id);
      if (!journal || isJournalLocked(journal)) return false;   // מניעת שמירה כפולה

      const full = fullJournalFromState(state, id);
      if (!full) return false;
      if (blockingIssues(validateJournal(full)).length > 0) return false;

      setState((s) => {
        const j = s.journals.find((x) => x.id === id);
        if (!j || isJournalLocked(j)) return s;
        const at = isoNow();
        const after: Journal = { ...j, status: 'completed', completedAt: at, updatedAt: at };
        const completed: AppState = { ...s, journals: s.journals.map((x) => (x.id === id ? after : x)) };
        const snapshot = buildJournalSnapshot(completed, id);
        return {
          ...completed,
          journalSnapshots: snapshot
            ? [...completed.journalSnapshots.filter((sn) => sn.journalId !== id), snapshot]
            : completed.journalSnapshots,
          auditLog: [...s.auditLog, audit({ entity: 'journals', entityId: id, action: 'complete' })],
        };
      });
      return true;
    },
    [audit, state],
  );

  /**
   * ביטול יומן – הדרך היחידה "לבטל" תיעוד. היומן נשאר במערכת
   * עם סטטוס מבוטל וסיבה מתועדת, ואינו נמחק. ללא סיבה אין ביטול.
   */
  const cancelJournal = useCallback<StoreValue['cancelJournal']>(
    (id, reason) => {
      const documented = reason.trim();
      if (!documented) return;
      setState((s) => ({
        ...s,
        journals: s.journals.map((j) =>
          j.id === id
            ? { ...j, status: 'cancelled', cancelledReason: documented, updatedAt: isoNow() }
            : j,
        ),
        auditLog: [
          ...s.auditLog,
          audit({ entity: 'journals', entityId: id, action: 'cancel', after: documented }),
        ],
      }));
    },
    [audit],
  );

  const getFullJournal = useCallback<StoreValue['getFullJournal']>(
    (id) => fullJournalFromState(state, id),
    [state],
  );

  /* ───────── מזיקים ופעולות ───────── */

  const setJournalPest = useCallback<StoreValue['setJournalPest']>((journalId, pestId, patch) => {
    setState((s) => {
      if (lockedJournal(s, journalId)) return s;
      const existing = s.journalPests.find((p) => p.journalId === journalId && p.pestId === pestId);
      if (existing) {
        return {
          ...s,
          journalPests: s.journalPests.map((p) => (p.id === existing.id ? { ...p, ...patch } : p)),
        };
      }
      const created: JournalPest = {
        id: newId('jps'), journalId, pestId, severity: 'low', areas: [], signs: [], ...patch,
      };
      return { ...s, journalPests: [...s.journalPests, created] };
    });
  }, []);

  const removeJournalPest = useCallback<StoreValue['removeJournalPest']>((journalId, pestId) => {
    setState((s) => (lockedJournal(s, journalId) ? s : {
      ...s,
      journalPests: s.journalPests.filter((p) => !(p.journalId === journalId && p.pestId === pestId)),
    }));
  }, []);

  const toggleJournalAction = useCallback<StoreValue['toggleJournalAction']>((journalId, kind) => {
    setState((s) => {
      if (lockedJournal(s, journalId)) return s;
      const existing = s.journalActions.find((a) => a.journalId === journalId && a.kind === kind);
      if (existing) {
        return { ...s, journalActions: s.journalActions.filter((a) => a.id !== existing.id) };
      }
      const created: JournalAction = { id: newId('jac'), journalId, kind, areas: [], equipment: [] };
      return { ...s, journalActions: [...s.journalActions, created] };
    });
  }, []);

  const updateJournalAction = useCallback<StoreValue['updateJournalAction']>((id, patch) => {
    setState((s) => {
      const action = s.journalActions.find((a) => a.id === id);
      if (!action || lockedJournal(s, action.journalId)) return s;
      return { ...s, journalActions: s.journalActions.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
    });
  }, []);

  /* ───────── חומרים ביומן ───────── */

  /**
   * בחירת חומר: מוסיפה רשומה אמיתית ל-journal_materials עם מזהה החומר,
   * צילום השם, ותבנית הטיפול אם נבחרה. נתוני הביצוע נשארים ריקים בכוונה.
   */
  const selectMaterial = useCallback<StoreValue['selectMaterial']>(
    (journalId, material, templateId) => {
      const record: JournalMaterial = {
        id: newId('jmt'),
        journalId,
        materialId: material.id,
        materialNameSnapshot: material.tradeName,
        templateId,
        conditionAnswers: {},
        execution: emptyExecution(),
      };
      setState((s) => (lockedJournal(s, journalId) ? s : {
        ...s, journalMaterials: [...s.journalMaterials, record],
      }));
      return record;
    },
    [],
  );

  /** החלפת חומר: מנקה מינון ונתוני ביצוע של החומר שהוחלף בלבד. */
  const replaceJournalMaterial = useCallback<StoreValue['replaceJournalMaterial']>(
    (journalMaterialId, material, templateId) => {
      setState((s) => (lockedJournal(
        s, s.journalMaterials.find((m) => m.id === journalMaterialId)?.journalId,
      ) ? s : {
        ...s,
        journalMaterials: s.journalMaterials.map((m) =>
          m.id === journalMaterialId
            ? {
                ...m,
                materialId: material.id,
                materialNameSnapshot: material.tradeName,
                templateId,
                conditionAnswers: {},
                execution: emptyExecution(),
                acknowledgedUnverified: false,
                acknowledgedAt: undefined,
              }
            : m,
        ),
      }));
    },
    [],
  );

  const updateJournalMaterial = useCallback<StoreValue['updateJournalMaterial']>(
    (id, patch) => {
      setState((s) => {
        const before = s.journalMaterials.find((m) => m.id === id);
        if (!before || lockedJournal(s, before.journalId)) return s;
        const materials = s.journalMaterials.map((m) => (m.id === id ? { ...m, ...patch } : m));
        return { ...s, journalMaterials: materials };
      });
    },
    [],
  );

  const removeJournalMaterial = useCallback<StoreValue['removeJournalMaterial']>((id) => {
    setState((s) => {
      const material = s.journalMaterials.find((m) => m.id === id);
      if (!material || lockedJournal(s, material.journalId)) return s;
      return { ...s, journalMaterials: s.journalMaterials.filter((m) => m.id !== id) };
    });
  }, []);

  /* ───────── תיבות, חתימות, קבצים ───────── */

  const upsertBaitStation = useCallback<StoreValue['upsertBaitStation']>((rec) => {
    setState((s) => {
      if (lockedJournal(s, rec.journalId)) return s;
      if (rec.id && s.baitStations.some((b) => b.id === rec.id)) {
        return {
          ...s,
          baitStations: s.baitStations.map((b) => (b.id === rec.id ? { ...b, ...rec } as BaitStationRecord : b)),
        };
      }
      return { ...s, baitStations: [...s.baitStations, { ...rec, id: rec.id ?? newId('bst') } as BaitStationRecord] };
    });
  }, []);

  const removeBaitStation = useCallback<StoreValue['removeBaitStation']>((id) => {
    setState((s) => {
      const station = s.baitStations.find((b) => b.id === id);
      if (!station || lockedJournal(s, station.journalId)) return s;
      return { ...s, baitStations: s.baitStations.filter((b) => b.id !== id) };
    });
  }, []);

  const saveSignature = useCallback<StoreValue['saveSignature']>(
    (sig) => {
      setState((s) => {
        if (lockedJournal(s, sig.journalId)) return s;
        const existing = s.signatures.find((x) => x.journalId === sig.journalId && x.role === sig.role);
        const record: Signature = { ...sig, id: existing?.id ?? newId('sgn') };
        // תמונת החתימה היא הראיה עצמה ונשלחת במלואה, לא כמציין מקום
        return {
          ...s,
          signatures: existing
            ? s.signatures.map((x) => (x.id === existing.id ? record : x))
            : [...s.signatures, record],
        };
      });
    },
    [],
  );

  /** מחיקת חתימה: גם מקומית וגם בשרת, כך שרענון לא יחזיר אותה. */
  const removeSignature = useCallback<StoreValue['removeSignature']>(
    (journalId, role) => {
      setState((s) => {
        if (lockedJournal(s, journalId)) return s;
        const existing = s.signatures.find((x) => x.journalId === journalId && x.role === role);
        if (!existing) return s;
        return { ...s, signatures: s.signatures.filter((x) => x.id !== existing.id) };
      });
    },
    [],
  );

  const addAttachment = useCallback<StoreValue['addAttachment']>((att) => {
    setState((s) => (lockedJournal(s, att.journalId) ? s : {
      ...s,
      attachments: [...s.attachments, { ...att, id: newId('att'), createdAt: isoNow() }],
    }));
  }, []);

  const removeAttachment = useCallback<StoreValue['removeAttachment']>((id) => {
    setState((s) => {
      const file = s.attachments.find((a) => a.id === id);
      if (!file || lockedJournal(s, file.journalId)) return s;
      return { ...s, attachments: s.attachments.filter((a) => a.id !== id) };
    });
  }, []);

  /* ───────── תבניות ───────── */

  const saveCustomerTemplate = useCallback<StoreValue['saveCustomerTemplate']>(
    (tpl) => {
      const created: CustomerTemplate = { ...tpl, id: newId('ctp'), createdAt: isoNow() };
      setState((s) => ({ ...s, customerTemplates: [...s.customerTemplates, created] }));
      return created;
    },
    [],
  );

  const updateTreatmentTemplate = useCallback<StoreValue['updateTreatmentTemplate']>((id, patch) => {
    setState((s) => ({
      ...s,
      treatmentTemplates: s.treatmentTemplates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const duplicateTreatmentTemplate = useCallback<StoreValue['duplicateTreatmentTemplate']>((id) => {
    setState((s) => {
      const src = s.treatmentTemplates.find((t) => t.id === id);
      if (!src) return s;
      const copy: TreatmentTemplate = {
        ...src, id: newId('tpl'), name: `${src.name} (עותק)`, system: false,
      };
      return { ...s, treatmentTemplates: [...s.treatmentTemplates, copy] };
    });
  }, []);

  const archiveTreatmentTemplate = useCallback<StoreValue['archiveTreatmentTemplate']>((id) => {
    setState((s) => ({
      ...s,
      treatmentTemplates: s.treatmentTemplates.map((t) => (t.id === id ? { ...t, archived: !t.archived } : t)),
    }));
  }, []);

  const archiveCustomerTemplate = useCallback<StoreValue['archiveCustomerTemplate']>((id) => {
    setState((s) => ({
      ...s,
      customerTemplates: s.customerTemplates.map((t) => (t.id === id ? { ...t, archived: !t.archived } : t)),
    }));
  }, []);

  /* ───────── שכפול וטעינה מיומן אחרון ───────── */

  const duplicateJournal = useCallback<StoreValue['duplicateJournal']>(
    (id) => {
      const src = state.journals.find((j) => j.id === id);
      if (!src) return null;
      const now = isoNow();
      const copy: Journal = {
        ...src,
        id: newId('jrn'),
        journalNumber: state.counters.journalNumber,
        status: 'draft',
        startedAt: now,
        createdAt: now,
        updatedAt: now,
        completedAt: undefined,
        customerAcknowledged: false,
        lastStep: 1,
        visitKind: 'followup',
      };
      setState((s) => ({
        ...s,
        journals: [...s.journals, copy],
        counters: { ...s.counters, journalNumber: s.counters.journalNumber + 1 },
        auditLog: [...s.auditLog, audit({ entity: 'journals', entityId: copy.id, action: 'create', after: `שוכפל מ-${src.journalNumber}` })],
      }));
      return copy;
    },
    [state.journals, state.counters.journalNumber, audit],
  );

  /**
   * טעינה מיומן אחרון: מעתיקה פרטים קבועים בלבד.
   * אצווה, תפוגה, כמויות, תאריך, ממצאים וחתימות נשארים ריקים ודורשים אישור מחדש.
   */
  const loadFromLastJournal = useCallback<StoreValue['loadFromLastJournal']>(
    (journalId, customerId) => {
      if (isJournalLocked(state.journals.find((j) => j.id === journalId))) return null;
      const previous = state.journals
        .filter((j) => j.customerId === customerId && j.id !== journalId && j.status !== 'cancelled')
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      if (!previous) return null;

      const copied = ['לקוח ואתר', 'סוג עבודה', 'הערות כניסה', 'המלצות מניעה', 'סוג אחריות'];
      const cleared = ['תאריך ושעה', 'ממצאים ורמת נגיעות', 'מספר אצווה', 'תפוגת אריזה', 'כמויות בפועל', 'חתימות'];

      setState((s) => {
        if (lockedJournal(s, journalId)) return s;
        const journals = s.journals.map((j) =>
          j.id === journalId
            ? {
                ...j,
                customerId: previous.customerId,
                siteId: previous.siteId,
                siteKind: previous.siteKind,
                siteAddress: previous.siteAddress,
                siteAccessNotes: previous.siteAccessNotes,
                workKind: previous.workKind,
                visitKind: 'followup' as const,
                preventionRecommendations: [...previous.preventionRecommendations],
                warrantyKind: previous.warrantyKind,
                warrantyValue: previous.warrantyValue,
                // מנוקה במפורש:
                findingsNotes: undefined,
                summary: undefined,
                nextInspectionDate: undefined,
                customerAcknowledged: false,
                updatedAt: isoNow(),
              }
            : j,
        );
        // החומרים מועתקים כשלד בלבד – ללא נתוני ביצוע, ודורשים אישור מחדש
        const prevMaterials = s.journalMaterials.filter((m) => m.journalId === previous.id);
        const newMaterials: JournalMaterial[] = prevMaterials.map((m) => ({
          id: newId('jmt'),
          journalId,
          materialId: m.materialId,
          materialNameSnapshot: m.materialNameSnapshot,
          templateId: m.templateId,
          conditionAnswers: {},
          execution: emptyExecution(),
        }));
        return {
          ...s,
          journals,
          journalMaterials: [
            ...s.journalMaterials.filter((m) => m.journalId !== journalId),
            ...newMaterials,
          ],
          // ממצאים וחתימות של היומן החדש מתאפסים
          journalPests: s.journalPests.filter((p) => p.journalId !== journalId),
          signatures: s.signatures.filter((sg) => sg.journalId !== journalId),
          auditLog: [
            ...s.auditLog,
            audit({ entity: 'journals', entityId: journalId, action: 'update', field: 'loadFromLastJournal', after: previous.id }),
          ],
        };
      });
      return { copied, cleared };
    },
    [state.journals, audit],
  );

  /* ───────── מסלול ומשימות ───────── */

  const createRoute = useCallback<StoreValue['createRoute']>(
    (draft) => {
      const route: Route = { ...draft, id: newId('rte'), createdAt: isoNow() };
      setState((s) => ({ ...s, routes: [...s.routes, route] }));
      return route;
    },
    [],
  );

  const addRouteStop = useCallback<StoreValue['addRouteStop']>((routeId, customerId, siteId) => {
    setState((s) => {
      const position = s.routeStops.filter((st) => st.routeId === routeId).length;
      const stop: RouteStop = {
        id: newId('stp'), routeId, customerId, siteId, position, status: 'pending',
      };
      return { ...s, routeStops: [...s.routeStops, stop] };
    });
  }, []);

  const updateRouteStop = useCallback<StoreValue['updateRouteStop']>(
    (id, patch) => {
      setState((s) => {
        const stops = s.routeStops.map((st) => (st.id === id ? { ...st, ...patch } : st));
        return { ...s, routeStops: stops };
      });
    },
    [],
  );

  const moveRouteStop = useCallback<StoreValue['moveRouteStop']>((routeId, stopId, direction) => {
    setState((s) => {
      const stops = s.routeStops
        .filter((st) => st.routeId === routeId)
        .sort((a, b) => a.position - b.position);
      const idx = stops.findIndex((st) => st.id === stopId);
      const target = idx + direction;
      if (idx === -1 || target < 0 || target >= stops.length) return s;
      const reordered = [...stops];
      [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
      const positionById = new Map(reordered.map((st, i) => [st.id, i]));
      return {
        ...s,
        routeStops: s.routeStops.map((st) =>
          positionById.has(st.id) ? { ...st, position: positionById.get(st.id)! } : st,
        ),
      };
    });
  }, []);

  /** קובע סדר חדש לכל התחנות במסלול (גרירה או סדר מומלץ). */
  const reorderRouteStops = useCallback<StoreValue['reorderRouteStops']>((routeId, orderedStopIds) => {
    setState((s) => {
      const positionById = new Map(orderedStopIds.map((id, i) => [id, i]));
      return {
        ...s,
        routeStops: s.routeStops.map((st) =>
          st.routeId === routeId && positionById.has(st.id)
            ? { ...st, position: positionById.get(st.id)! }
            : st,
        ),
      };
    });
  }, []);

  const removeRouteStop = useCallback<StoreValue['removeRouteStop']>((id) => {
    setState((s) => ({ ...s, routeStops: s.routeStops.filter((st) => st.id !== id) }));
  }, []);

  const createTask = useCallback<StoreValue['createTask']>(
    (draft) => {
      const task: Task = { ...draft, id: newId('tsk'), createdAt: isoNow() };
      setState((s) => ({ ...s, tasks: [...s.tasks, task] }));
      return task;
    },
    [],
  );

  const updateTask = useCallback<StoreValue['updateTask']>((id, patch) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }, []);

  const exportBackup = useCallback<StoreValue['exportBackup']>(
    () => buildBackup(state),
    [state],
  );

  /**
   * ייבוא גיבוי. אינו דורס רשומה שקיימת במכשיר, ולכן אינו יכול
   * למחוק תיעוד. התוצאה מוצגת למשתמש כמספרים, ולא כ"הצליח".
   */
  const importBackup = useCallback<StoreValue['importBackup']>((file) => {
    const { plan, state: merged } = mergeBackup(stateRef.current ?? state, file);
    if (plan.total > 0) setState(merged);
    return plan;
  }, [state]);

  const getJournalSnapshot = useCallback<StoreValue['getJournalSnapshot']>(
    (id) => state.journalSnapshots.find((sn) => sn.journalId === id),
    [state.journalSnapshots],
  );

  const isLocked = useCallback<StoreValue['isLocked']>(
    (id) => isJournalLocked(state.journals.find((j) => j.id === id)),
    [state.journals],
  );

  const labelFor = useCallback<StoreValue['labelFor']>(
    (materialId) => state.materialLabels.find((l) => l.materialId === materialId),
    [state.materialLabels],
  );

  const retrySave = useCallback(async () => {
    setSaveState('saving');
    const outcome = await kvSet(storageKey, stateRef.current);
    setSaveState(outcome.durable ? 'saved' : 'failed');
    setSaveErrors(outcome.durable ? [] : outcome.errors);
  }, [storageKey]);

  const resetAll = useCallback(() => {
    setState(seedState());
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state, saveState, saveErrors, retrySave, pendingSync, online, ready,
      syncRejected, retrySync, dismissSyncRejection, pullFromServer,
      updateExterminator,
      createCustomer, updateCustomer, createSite,
      createJournal, updateJournal, completeJournal, cancelJournal, duplicateJournal, loadFromLastJournal,
      setJournalPest, removeJournalPest, toggleJournalAction, updateJournalAction,
      selectMaterial, replaceJournalMaterial, updateJournalMaterial, removeJournalMaterial,
      upsertBaitStation, removeBaitStation, saveSignature, removeSignature,
      addAttachment, removeAttachment,
      saveCustomerTemplate, updateTreatmentTemplate, duplicateTreatmentTemplate,
      archiveTreatmentTemplate, archiveCustomerTemplate,
      createRoute, addRouteStop, updateRouteStop, moveRouteStop, reorderRouteStops, removeRouteStop,
      createTask, updateTask, exportBackup, importBackup,
      getFullJournal, getJournalSnapshot, isLocked, labelFor, resetAll,
    }),
    [
      state, saveState, saveErrors, retrySave, pendingSync, online, ready,
      syncRejected, retrySync, dismissSyncRejection, pullFromServer,
      updateExterminator,
      createCustomer, updateCustomer, createSite,
      createJournal, updateJournal, completeJournal, cancelJournal, duplicateJournal, loadFromLastJournal,
      setJournalPest, removeJournalPest, toggleJournalAction, updateJournalAction,
      selectMaterial, replaceJournalMaterial, updateJournalMaterial, removeJournalMaterial,
      upsertBaitStation, removeBaitStation, saveSignature, removeSignature,
      addAttachment, removeAttachment,
      saveCustomerTemplate, updateTreatmentTemplate, duplicateTreatmentTemplate,
      archiveTreatmentTemplate, archiveCustomerTemplate,
      createRoute, addRouteStop, updateRouteStop, moveRouteStop, reorderRouteStops, removeRouteStop,
      createTask, updateTask, exportBackup, importBackup,
      getFullJournal, getJournalSnapshot, isLocked, labelFor, resetAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
