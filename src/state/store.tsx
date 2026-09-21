import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type {
  AppState, AuditEntry, BaitStationRecord, Customer, CustomerSite, CustomerTemplate, Exterminator,
  FullJournal, ID, Journal, JournalAction, JournalMaterial, JournalPest, Material,
  MaterialLabel, Route, RouteStop, Signature, Task, TreatmentTemplate, Attachment,
} from '../types';
import { seedState } from './seed';
import { kvGet, kvSet } from '../lib/storage';
import { syncQueue, startSyncWatchers } from '../lib/sync';
import { newId } from '../lib/id';
import { isoNow } from '../lib/format';

const STATE_KEY = 'app-state-v1';

export type SaveState = 'idle' | 'saving' | 'saved';

interface StoreValue {
  state: AppState;
  saveState: SaveState;
  pendingSync: number;
  online: boolean;
  ready: boolean;

  /* מדביר */
  updateExterminator: (id: ID, patch: Partial<Exterminator>) => void;

  /* לקוחות */
  createCustomer: (draft: Omit<Customer, 'id' | 'customerNumber' | 'createdAt' | 'updatedAt'>) => Customer;
  updateCustomer: (id: ID, patch: Partial<Customer>) => void;
  createSite: (draft: Omit<CustomerSite, 'id'>) => CustomerSite;

  /* יומן */
  createJournal: () => Journal;
  updateJournal: (id: ID, patch: Partial<Journal>) => void;
  completeJournal: (id: ID) => void;
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
  removeRouteStop: (id: ID) => void;
  createTask: (draft: Omit<Task, 'id' | 'createdAt'>) => Task;
  updateTask: (id: ID, patch: Partial<Task>) => void;

  /* עזר */
  getFullJournal: (id: ID) => FullJournal | null;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => seedState());
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [pendingSync, setPendingSync] = useState(0);
  const [online, setOnline] = useState(true);
  const saveTimer = useRef<number | undefined>(undefined);
  const loadedRef = useRef(false);
  const stateRef = useRef<AppState>(state);

  /* טעינה ראשונית מהאחסון המקומי */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await kvGet<AppState>(STATE_KEY);
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
    const unsub = syncQueue.subscribe((p, o) => {
      setPendingSync(p);
      setOnline(o);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  /* שמירה אוטומטית משוהה – בלי toast בכל שדה */
  useEffect(() => {
    if (!ready || !loadedRef.current) return;
    stateRef.current = state;
    setSaveState('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void kvSet(STATE_KEY, state).then(() => setSaveState('saved'));
    }, 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [state, ready]);

  /**
   * סגירת האפליקציה או מעבר לרקע מיד אחרי שינוי עלולים לתפוס את השמירה
   * באמצע ההשהיה. כאן מאלצים כתיבה מיידית כדי שלא ייאבד שינוי אחרון בשטח.
   */
  useEffect(() => {
    const flush = (): void => {
      window.clearTimeout(saveTimer.current);
      if (loadedRef.current) void kvSet(STATE_KEY, stateRef.current);
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
  }, []);

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

  const push = useCallback((entity: string, entityId: ID, payload: unknown) => {
    void syncQueue.enqueue(entity, entityId, payload);
  }, []);

  /* ───────── מדביר ───────── */

  const updateExterminator = useCallback<StoreValue['updateExterminator']>(
    (id, patch) => {
      setState((s) => {
        const exterminators = s.exterminators.map((e) => (e.id === id ? { ...e, ...patch } : e));
        const updated = exterminators.find((e) => e.id === id);
        if (updated) push('exterminators', id, updated);
        return { ...s, exterminators };
      });
    },
    [push],
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
      push('customers', customer.id, customer);
      return customer;
    },
    [state.counters.customerNumber, audit, push],
  );

  const updateCustomer = useCallback<StoreValue['updateCustomer']>(
    (id, patch) => {
      setState((s) => {
        const customers = s.customers.map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: isoNow() } : c,
        );
        const updated = customers.find((c) => c.id === id);
        if (updated) push('customers', id, updated);
        return {
          ...s,
          customers,
          auditLog: [...s.auditLog, audit({ entity: 'customers', entityId: id, action: 'update' })],
        };
      });
    },
    [audit, push],
  );

  const createSite = useCallback<StoreValue['createSite']>(
    (draft) => {
      const site: CustomerSite = { ...draft, id: newId('sit') };
      setState((s) => ({ ...s, sites: [...s.sites, site] }));
      push('customer_sites', site.id, site);
      return site;
    },
    [push],
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
    push('journals', journal.id, journal);
    return journal;
  }, [state.exterminators, state.counters.journalNumber, audit, push]);

  const updateJournal = useCallback<StoreValue['updateJournal']>(
    (id, patch) => {
      setState((s) => {
        const before = s.journals.find((j) => j.id === id);
        if (!before) return s;
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
        push('journals', id, after);
        return {
          ...s,
          journals: s.journals.map((j) => (j.id === id ? after : j)),
          auditLog: entries.length ? [...s.auditLog, ...entries] : s.auditLog,
        };
      });
    },
    [audit, push],
  );

  const completeJournal = useCallback<StoreValue['completeJournal']>(
    (id) => {
      setState((s) => {
        const j = s.journals.find((x) => x.id === id);
        if (!j || j.status === 'completed' || j.status === 'sent') return s; // מניעת שמירה כפולה
        const after: Journal = { ...j, status: 'completed', completedAt: isoNow(), updatedAt: isoNow() };
        push('journals', id, after);
        return {
          ...s,
          journals: s.journals.map((x) => (x.id === id ? after : x)),
          auditLog: [...s.auditLog, audit({ entity: 'journals', entityId: id, action: 'complete' })],
        };
      });
    },
    [audit, push],
  );

  const cancelJournal = useCallback<StoreValue['cancelJournal']>(
    (id, reason) => {
      setState((s) => ({
        ...s,
        journals: s.journals.map((j) =>
          j.id === id ? { ...j, status: 'cancelled', cancelledReason: reason, updatedAt: isoNow() } : j,
        ),
        auditLog: [
          ...s.auditLog,
          audit({ entity: 'journals', entityId: id, action: 'cancel', after: reason }),
        ],
      }));
    },
    [audit],
  );

  const getFullJournal = useCallback<StoreValue['getFullJournal']>(
    (id) => {
      const journal = state.journals.find((j) => j.id === id);
      if (!journal) return null;
      return {
        journal,
        pests: state.journalPests.filter((p) => p.journalId === id),
        actions: state.journalActions.filter((a) => a.journalId === id),
        materials: state.journalMaterials.filter((m) => m.journalId === id),
        baitStations: state.baitStations.filter((b) => b.journalId === id),
        signatures: state.signatures.filter((sg) => sg.journalId === id),
        attachments: state.attachments.filter((a) => a.journalId === id),
      };
    },
    [state],
  );

  /* ───────── מזיקים ופעולות ───────── */

  const setJournalPest = useCallback<StoreValue['setJournalPest']>((journalId, pestId, patch) => {
    setState((s) => {
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
    setState((s) => ({
      ...s,
      journalPests: s.journalPests.filter((p) => !(p.journalId === journalId && p.pestId === pestId)),
    }));
  }, []);

  const toggleJournalAction = useCallback<StoreValue['toggleJournalAction']>((journalId, kind) => {
    setState((s) => {
      const existing = s.journalActions.find((a) => a.journalId === journalId && a.kind === kind);
      if (existing) {
        return { ...s, journalActions: s.journalActions.filter((a) => a.id !== existing.id) };
      }
      const created: JournalAction = { id: newId('jac'), journalId, kind, areas: [], equipment: [] };
      return { ...s, journalActions: [...s.journalActions, created] };
    });
  }, []);

  const updateJournalAction = useCallback<StoreValue['updateJournalAction']>((id, patch) => {
    setState((s) => ({
      ...s,
      journalActions: s.journalActions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
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
      setState((s) => ({ ...s, journalMaterials: [...s.journalMaterials, record] }));
      push('journal_materials', record.id, record);
      return record;
    },
    [push],
  );

  /** החלפת חומר: מנקה מינון ונתוני ביצוע של החומר שהוחלף בלבד. */
  const replaceJournalMaterial = useCallback<StoreValue['replaceJournalMaterial']>(
    (journalMaterialId, material, templateId) => {
      setState((s) => ({
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
        const materials = s.journalMaterials.map((m) => (m.id === id ? { ...m, ...patch } : m));
        const updated = materials.find((m) => m.id === id);
        if (updated) push('journal_materials', id, updated);
        return { ...s, journalMaterials: materials };
      });
    },
    [push],
  );

  const removeJournalMaterial = useCallback<StoreValue['removeJournalMaterial']>((id) => {
    setState((s) => ({ ...s, journalMaterials: s.journalMaterials.filter((m) => m.id !== id) }));
  }, []);

  /* ───────── תיבות, חתימות, קבצים ───────── */

  const upsertBaitStation = useCallback<StoreValue['upsertBaitStation']>((rec) => {
    setState((s) => {
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
    setState((s) => ({ ...s, baitStations: s.baitStations.filter((b) => b.id !== id) }));
  }, []);

  const saveSignature = useCallback<StoreValue['saveSignature']>(
    (sig) => {
      setState((s) => {
        const existing = s.signatures.find((x) => x.journalId === sig.journalId && x.role === sig.role);
        const record: Signature = { ...sig, id: existing?.id ?? newId('sgn') };
        push('signatures', record.id, { ...record, image: '[stored]' });
        return {
          ...s,
          signatures: existing
            ? s.signatures.map((x) => (x.id === existing.id ? record : x))
            : [...s.signatures, record],
        };
      });
    },
    [push],
  );

  const addAttachment = useCallback<StoreValue['addAttachment']>((att) => {
    setState((s) => ({
      ...s,
      attachments: [...s.attachments, { ...att, id: newId('att'), createdAt: isoNow() }],
    }));
  }, []);

  const removeAttachment = useCallback<StoreValue['removeAttachment']>((id) => {
    setState((s) => ({ ...s, attachments: s.attachments.filter((a) => a.id !== id) }));
  }, []);

  /* ───────── תבניות ───────── */

  const saveCustomerTemplate = useCallback<StoreValue['saveCustomerTemplate']>(
    (tpl) => {
      const created: CustomerTemplate = { ...tpl, id: newId('ctp'), createdAt: isoNow() };
      setState((s) => ({ ...s, customerTemplates: [...s.customerTemplates, created] }));
      push('customer_templates', created.id, created);
      return created;
    },
    [push],
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
      const previous = state.journals
        .filter((j) => j.customerId === customerId && j.id !== journalId && j.status !== 'cancelled')
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      if (!previous) return null;

      const copied = ['לקוח ואתר', 'סוג עבודה', 'הערות כניסה', 'המלצות מניעה', 'סוג אחריות'];
      const cleared = ['תאריך ושעה', 'ממצאים ורמת נגיעות', 'מספר אצווה', 'תפוגת אריזה', 'כמויות בפועל', 'חתימות'];

      setState((s) => {
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
      push('routes', route.id, route);
      return route;
    },
    [push],
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
        const updated = stops.find((st) => st.id === id);
        if (updated) push('route_stops', id, updated);
        return { ...s, routeStops: stops };
      });
    },
    [push],
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

  const removeRouteStop = useCallback<StoreValue['removeRouteStop']>((id) => {
    setState((s) => ({ ...s, routeStops: s.routeStops.filter((st) => st.id !== id) }));
  }, []);

  const createTask = useCallback<StoreValue['createTask']>(
    (draft) => {
      const task: Task = { ...draft, id: newId('tsk'), createdAt: isoNow() };
      setState((s) => ({ ...s, tasks: [...s.tasks, task] }));
      push('tasks', task.id, task);
      return task;
    },
    [push],
  );

  const updateTask = useCallback<StoreValue['updateTask']>((id, patch) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }, []);

  const labelFor = useCallback<StoreValue['labelFor']>(
    (materialId) => state.materialLabels.find((l) => l.materialId === materialId),
    [state.materialLabels],
  );

  const resetAll = useCallback(() => {
    setState(seedState());
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state, saveState, pendingSync, online, ready,
      updateExterminator,
      createCustomer, updateCustomer, createSite,
      createJournal, updateJournal, completeJournal, cancelJournal, duplicateJournal, loadFromLastJournal,
      setJournalPest, removeJournalPest, toggleJournalAction, updateJournalAction,
      selectMaterial, replaceJournalMaterial, updateJournalMaterial, removeJournalMaterial,
      upsertBaitStation, removeBaitStation, saveSignature, addAttachment, removeAttachment,
      saveCustomerTemplate, updateTreatmentTemplate, duplicateTreatmentTemplate,
      archiveTreatmentTemplate, archiveCustomerTemplate,
      createRoute, addRouteStop, updateRouteStop, moveRouteStop, removeRouteStop,
      createTask, updateTask, getFullJournal, labelFor, resetAll,
    }),
    [
      state, saveState, pendingSync, online, ready,
      updateExterminator,
      createCustomer, updateCustomer, createSite,
      createJournal, updateJournal, completeJournal, cancelJournal, duplicateJournal, loadFromLastJournal,
      setJournalPest, removeJournalPest, toggleJournalAction, updateJournalAction,
      selectMaterial, replaceJournalMaterial, updateJournalMaterial, removeJournalMaterial,
      upsertBaitStation, removeBaitStation, saveSignature, addAttachment, removeAttachment,
      saveCustomerTemplate, updateTreatmentTemplate, duplicateTreatmentTemplate,
      archiveTreatmentTemplate, archiveCustomerTemplate,
      createRoute, addRouteStop, updateRouteStop, moveRouteStop, removeRouteStop,
      createTask, updateTask, getFullJournal, labelFor, resetAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
