import { useCallback, useEffect, useRef, useState } from 'react';
import { getDraft, putDraft, type StoredDraft } from '@/lib/db/idb';
import { contentFingerprint } from '@/lib/hash';
import { idempotencyKey } from '@/lib/ids';
import { setAtPath, deleteAtPath, type Mutable } from '@/lib/paths';
import { emptyDraftContent } from '@/schema/pestLog';
import type { SyncEngine } from '@/lib/sync/engine';
import type { SyncState } from '@/schema/enums';

/**
 * ניהול טיוטה אחת.
 *
 * - כל שינוי נשמר מיד ל-IndexedDB (שמירה אוטומטית), ואחרי השהייה קצרה
 *   נשלח גם לשרת. אין "כפתור שמור" שאפשר לשכוח ללחוץ עליו.
 * - כשאין קליטה השינוי נשאר בתור ונשלח כשהחיבור חוזר.
 * - מצב השמירה מוצג תמיד: נשמר מקומית / ממתין לסנכרון / סונכרן / שגיאה.
 */

const AUTOSAVE_DEBOUNCE_MS = 900;

export interface DraftState {
  content: Mutable;
  loading: boolean;
  syncState: SyncState;
  lastSavedAt: string | null;
  lastError: string | null;
  readOnly: boolean;
  serialNumber: number | null;
  status: 'draft' | 'completed' | 'cancelled';
}

export interface DraftApi extends DraftState {
  /** מעדכן שדה בודד לפי נתיב. */
  setField: (path: string, value: unknown) => void;
  /** מעדכן כמה שדות בבת אחת (למשל מילוי אוטומטי מלקוח שנבחר). */
  setFields: (updates: Array<{ path: string; value: unknown }>) => void;
  /** מסיר פריט ממערך. */
  removeAt: (path: string) => void;
  /** מוסיף פריט למערך. */
  appendTo: (path: string, item: unknown) => void;
  /** מחליף את כל התוכן (שכפול יומן, ייבוא). */
  replaceContent: (content: Mutable) => void;
  /** מאלץ שמירה מיידית לשרת. */
  flushNow: () => Promise<void>;
}

export function useDraft(
  logId: string,
  organizationId: string | null,
  syncEngine: SyncEngine,
): DraftApi {
  const [state, setState] = useState<DraftState>({
    content: emptyDraftContent(),
    loading: true,
    syncState: 'local',
    lastSavedAt: null,
    lastError: null,
    readOnly: false,
    serialNumber: null,
    status: 'draft',
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<StoredDraft | null>(null);

  // ── טעינה ראשונית ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const existing = await getDraft(logId);
      if (cancelled) return;

      if (existing) {
        draftRef.current = existing;
        setState({
          content: existing.content as Mutable,
          loading: false,
          syncState: existing.syncState,
          lastSavedAt: existing.syncedAt,
          lastError: existing.lastError,
          readOnly: existing.readOnly,
          serialNumber: existing.serialNumber,
          status: existing.status,
        });
        return;
      }

      if (!organizationId) {
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      const created: StoredDraft = {
        id: logId,
        organizationId,
        content: emptyDraftContent(),
        serverVersion: null,
        idempotencyKey: idempotencyKey('upsert_draft', logId, 'create'),
        updatedAt: new Date().toISOString(),
        syncedAt: null,
        syncState: 'local',
        lastError: null,
        syncedFingerprint: null,
        readOnly: false,
        serialNumber: null,
        status: 'draft',
      };
      await putDraft(created);
      draftRef.current = created;
      if (!cancelled) {
        setState({
          content: created.content as Mutable,
          loading: false,
          syncState: 'local',
          lastSavedAt: null,
          lastError: null,
          readOnly: false,
          serialNumber: null,
          status: 'draft',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [logId, organizationId]);

  /** שומר מקומית ומתזמן שליחה לשרת. */
  const persist = useCallback(
    (content: Mutable) => {
      const current = draftRef.current;
      if (!current || current.readOnly) return;

      const updated: StoredDraft = {
        ...current,
        content,
        updatedAt: new Date().toISOString(),
        syncState: 'local',
      };
      draftRef.current = updated;
      void putDraft(updated);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void (async () => {
          const draft = draftRef.current;
          if (!draft) return;
          const fingerprint = await contentFingerprint(draft.content);
          // טביעת האצבע שסונכרנה נקראת מהאחסון ולא מהזיכרון: מנוע הסנכרון
          // מעדכן אותה שם, ובלי קריאה טרייה היה נשלח שוב תוכן שכבר סונכרן.
          const stored = await getDraft(draft.id);
          const syncedFingerprint = stored?.syncedFingerprint ?? draft.syncedFingerprint;
          if (fingerprint === syncedFingerprint) return;

          const pending: StoredDraft = { ...draft, syncState: 'pending' };
          draftRef.current = pending;
          await putDraft(pending);
          setState((prev) => ({ ...prev, syncState: 'pending' }));

          await syncEngine.enqueue(
            'upsert_draft',
            draft.id,
            {
              organizationId: draft.organizationId,
              content: draft.content,
              expectedVersion: draft.serverVersion,
              fingerprint,
            },
            // הדיסקרימינטור הוא טביעת האצבע: אותו תוכן = אותה פעולה,
            // תוכן חדש = פעולה חדשה. כך אין כפילויות ואין דריסה.
            fingerprint.slice(0, 16),
          );
        })();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [syncEngine],
  );

  const applyContent = useCallback(
    (updater: (content: Mutable) => Mutable) => {
      setState((prev) => {
        if (prev.readOnly) return prev;
        const next = updater(prev.content);
        persist(next);
        return { ...prev, content: next, syncState: 'local' };
      });
    },
    [persist],
  );

  const setField = useCallback(
    (path: string, value: unknown) => applyContent((content) => setAtPath(content, path, value)),
    [applyContent],
  );

  const setFields = useCallback(
    (updates: Array<{ path: string; value: unknown }>) =>
      applyContent((content) => updates.reduce((acc, u) => setAtPath(acc, u.path, u.value), content)),
    [applyContent],
  );

  const removeAt = useCallback(
    (path: string) => applyContent((content) => deleteAtPath(content, path)),
    [applyContent],
  );

  const appendTo = useCallback(
    (path: string, item: unknown) =>
      applyContent((content) => {
        const existing = (content[path] ?? undefined) as unknown;
        const list = Array.isArray(existing)
          ? existing
          : (() => {
              const segments = path.split('.');
              const value = segments.reduce<unknown>(
                (acc, key) => (acc && typeof acc === 'object' ? (acc as Mutable)[key] : undefined),
                content,
              );
              return Array.isArray(value) ? value : [];
            })();
        return setAtPath(content, path, [...list, item]);
      }),
    [applyContent],
  );

  const replaceContent = useCallback(
    (content: Mutable) => applyContent(() => content),
    [applyContent],
  );

  const flushNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const draft = draftRef.current;
    if (!draft || draft.readOnly) return;
    const fingerprint = await contentFingerprint(draft.content);
    const stored = await getDraft(draft.id);
    if (fingerprint === (stored?.syncedFingerprint ?? draft.syncedFingerprint)) return;
    await syncEngine.enqueue(
      'upsert_draft',
      draft.id,
      {
        organizationId: draft.organizationId,
        content: draft.content,
        expectedVersion: draft.serverVersion,
        fingerprint,
      },
      fingerprint.slice(0, 16),
    );
    await syncEngine.flush();
  }, [syncEngine]);

  // מסנכרן את מצב הסנכרון מהאחסון המקומי (המנוע מעדכן אותו שם).
  useEffect(() => {
    const interval = setInterval(() => {
      void (async () => {
        const stored = await getDraft(logId);
        if (!stored) return;
        // התוכן הוא של המסך (הוא הטרי יותר), אבל מצב הסנכרון — כולל
        // syncedFingerprint ו-serverVersion — נלקח מהאחסון, שם מנוע
        // הסנכרון מעדכן אותו. בלי זה, draftRef היה מחזיק טביעת אצבע
        // מיושנת ושולח שוב תוכן שכבר סונכרן.
        draftRef.current = {
          ...stored,
          content: draftRef.current?.content ?? stored.content,
        };
        setState((prev) =>
          prev.syncState === stored.syncState && prev.lastError === stored.lastError
            ? prev
            : { ...prev, syncState: stored.syncState, lastError: stored.lastError, lastSavedAt: stored.syncedAt },
        );
      })();
    }, 2500);
    return () => clearInterval(interval);
  }, [logId]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { ...state, setField, setFields, removeAt, appendTo, replaceContent, flushNow };
}
