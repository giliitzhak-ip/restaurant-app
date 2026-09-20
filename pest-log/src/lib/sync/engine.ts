import {
  getMeta,
  putMeta,
  countFailedOperations,
  countPendingOperations,
  enqueueOperation,
  getDraft,
  listPendingOperations,
  putDraft,
  removeOperation,
  updateOperation,
  type OutboxOperation,
  type OutboxOperationType,
  type StoredDraft,
} from '@/lib/db/idb';
import { idempotencyKey } from '@/lib/ids';
import type { SyncState } from '@/schema/enums';

/**
 * מנוע הסנכרון.
 *
 * עקרונות:
 *  - כל שינוי נשמר קודם מקומית (IndexedDB) ורק אחר כך נשלח. אין אובדן
 *    מידע כשאין קליטה.
 *  - כל פעולה נושאת מפתח אידמפוטנטיות. ניסיון חוזר לא יוצר כפילות.
 *  - התנגשות גרסאות (P0004) לא נדרסת בשקט — היא מסומנת כשגיאת סנכרון
 *    ומוצגת למשתמש.
 *  - backoff מעריכי בין ניסיונות, עד גבול עליון.
 */

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  isOnline: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** תוצאת ביצוע פעולה מול השרת. */
export type OperationOutcome =
  | { ok: true; serverVersion?: number; result?: unknown }
  | { ok: false; error: string; conflict?: boolean; permanent?: boolean };

/** מבצע פעולה אחת מול השרת. מוזרק מבחוץ כדי שהמנוע יהיה ניתן לבדיקה. */
export type OperationExecutor = (operation: OutboxOperation) => Promise<OperationOutcome>;

const MAX_ATTEMPTS = 8;
/** כמה מפתחות אידמפוטנטיות שהושלמו נשמרים, כדי לא לשלוח אותם שוב. */
const APPLIED_KEYS_LIMIT = 300;
const APPLIED_KEYS_META = 'appliedOperationKeys';
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export function backoffDelayMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

type Listener = (status: SyncStatus) => void;

export class SyncEngine {
  private executor: OperationExecutor;
  private listeners = new Set<Listener>();
  /**
   * בקשות flush מסודרות בשרשרת. בקשה שמגיעה בזמן ריצה אינה נזרקת —
   * היא מחכה בתור ורצה אחריה. בלי זה, פעולה שנכנסה לתור בדיוק בזמן
   * flush אחר הייתה נשארת "ממתינה לסנכרון" עד לטריגר הבא.
   */
  private flushChain: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private online = true;
  /**
   * מפתחות שכבר בוצעו בהצלחה.
   *
   * המפתח נגזר מסוג הפעולה, מהיישות ומטביעת האצבע של התוכן, ולכן מפתח
   * שכבר בוצע מסמן שאותו תוכן בדיוק כבר נשלח. בלי הרשימה הזו, פעולה
   * שהוסרה מהתור לאחר שליחה מוצלחת הייתה יכולה להיכנס אליו שוב (למשל
   * כשהשמירה האוטומטית והיישוב בעלייה רצים במקביל) ולהישלח פעמיים.
   */
  private appliedKeys: Set<string> | null = null;

  constructor(executor: OperationExecutor) {
    this.executor = executor;
    this.online = globalThis.navigator?.onLine ?? true;
  }

  /** מחבר להאזנה לשינויי חיבור. מחזיר פונקציית ניתוק. */
  start(): () => void {
    const handleOnline = () => {
      this.online = true;
      void this.flush();
      this.notify();
    };
    const handleOffline = () => {
      this.online = false;
      this.notify();
    };
    globalThis.addEventListener?.('online', handleOnline);
    globalThis.addEventListener?.('offline', handleOffline);
    void this.flush();

    return () => {
      globalThis.removeEventListener?.('online', handleOnline);
      globalThis.removeEventListener?.('offline', handleOffline);
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.status().then(listener);
    return () => this.listeners.delete(listener);
  }

  async status(): Promise<SyncStatus> {
    const [pendingCount, failedCount] = await Promise.all([
      countPendingOperations(),
      countFailedOperations(),
    ]);
    let state: SyncState;
    if (failedCount > 0) state = 'error';
    else if (pendingCount > 0) state = this.online ? 'pending' : 'local';
    else state = this.online ? 'synced' : 'local';

    return {
      state,
      pendingCount,
      failedCount,
      isOnline: this.online,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  private notify(): void {
    void this.status().then((status) => {
      for (const listener of this.listeners) listener(status);
    });
  }

  private async loadAppliedKeys(): Promise<Set<string>> {
    if (this.appliedKeys) return this.appliedKeys;
    const stored = (await getMeta<string[]>(APPLIED_KEYS_META)) ?? [];
    this.appliedKeys = new Set(stored);
    return this.appliedKeys;
  }

  private async rememberAppliedKey(key: string): Promise<void> {
    const keys = await this.loadAppliedKeys();
    keys.add(key);
    // שמירה מוגבלת בגודל: רק המפתחות האחרונים נחוצים.
    const trimmed = Array.from(keys).slice(-APPLIED_KEYS_LIMIT);
    this.appliedKeys = new Set(trimmed);
    await putMeta(APPLIED_KEYS_META, trimmed);
  }

  /** מוסיף פעולה לתור ומנסה לשלוח מיד. */
  async enqueue(
    type: OutboxOperationType,
    entityId: string,
    payload: Record<string, unknown>,
    discriminator = '',
  ): Promise<string> {
    const key = idempotencyKey(type, entityId, discriminator);

    // אותו מפתח שכבר בוצע = אותו תוכן בדיוק. אין מה לשלוח שוב.
    const applied = await this.loadAppliedKeys();
    if (applied.has(key)) return key;

    const now = new Date().toISOString();
    await enqueueOperation({
      idempotencyKey: key,
      type,
      entityId,
      payload,
      createdAt: now,
      clientUpdatedAt: now,
      attempts: 0,
      lastError: null,
      status: 'pending',
      nextAttemptAt: now,
    });
    this.notify();
    void this.flush();
    return key;
  }

  /**
   * שולח את כל הפעולות הממתינות, לפי סדר יצירתן.
   * הקריאה מסודרת בשרשרת: המתנה לה מבטיחה שהפעולות שהיו בתור בעת
   * הקריאה כבר טופלו.
   */
  flush(): Promise<void> {
    this.flushChain = this.flushChain.then(
      () => this.runFlush(),
      () => this.runFlush(),
    );
    return this.flushChain;
  }

  private async runFlush(): Promise<void> {
    if (!this.online) {
      this.notify();
      return;
    }
    try {
      const operations = await listPendingOperations();
      const now = Date.now();

      for (const operation of operations) {
        if (operation.status === 'failed' && operation.attempts >= MAX_ATTEMPTS) continue;
        if (new Date(operation.nextAttemptAt).getTime() > now) continue;

        await updateOperation({ ...operation, status: 'inflight' });

        let outcome: OperationOutcome;
        try {
          outcome = await this.executor(operation);
        } catch (error) {
          outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }

        if (outcome.ok) {
          // הסימון "בוצע" קודם להסרה מהתור: בין ההסרה לסימון נפתח חלון
          // שבו enqueue מקביל לא היה רואה את המפתח, והתוכן היה נשלח פעמיים.
          await this.rememberAppliedKey(operation.idempotencyKey);
          await removeOperation(operation.idempotencyKey);
          this.lastSyncedAt = new Date().toISOString();
          this.lastError = null;
          await this.markDraftSynced(operation, outcome.serverVersion);
          continue;
        }

        const attempts = operation.attempts + 1;
        // התנגשות או שגיאה קבועה — אין טעם לנסות שוב אוטומטית.
        const permanent = Boolean(outcome.conflict ?? outcome.permanent) || attempts >= MAX_ATTEMPTS;
        this.lastError = outcome.error;

        await updateOperation({
          ...operation,
          attempts,
          lastError: outcome.error,
          status: permanent ? 'failed' : 'pending',
          nextAttemptAt: new Date(Date.now() + backoffDelayMs(attempts)).toISOString(),
        });

        await this.markDraftError(operation, outcome.error);

        if (!permanent) {
          this.scheduleRetry(backoffDelayMs(attempts));
          break;
        }
      }
    } finally {
      this.notify();
    }
  }

  /** ניסיון חוזר ידני לפעולות שנכשלו (כפתור "נסה שוב"). */
  async retryFailed(): Promise<void> {
    const operations = await listPendingOperations();
    for (const operation of operations) {
      if (operation.status !== 'failed') continue;
      await updateOperation({
        ...operation,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
      });
    }
    this.lastError = null;
    await this.flush();
  }

  private scheduleRetry(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  private async markDraftSynced(operation: OutboxOperation, serverVersion?: number): Promise<void> {
    if (operation.type !== 'upsert_draft' && operation.type !== 'complete_log') return;
    const draft = await getDraft(operation.entityId);
    if (!draft) return;
    const updated: StoredDraft = {
      ...draft,
      syncState: 'synced',
      syncedAt: new Date().toISOString(),
      lastError: null,
      serverVersion: serverVersion ?? draft.serverVersion,
      syncedFingerprint: (operation.payload.fingerprint as string | undefined) ?? draft.syncedFingerprint,
    };
    await putDraft(updated);
  }

  private async markDraftError(operation: OutboxOperation, error: string): Promise<void> {
    if (operation.type !== 'upsert_draft' && operation.type !== 'complete_log') return;
    const draft = await getDraft(operation.entityId);
    if (!draft) return;
    await putDraft({ ...draft, syncState: 'error', lastError: error });
  }

  /** לבדיקות: הגדרת מצב החיבור ידנית. */
  setOnlineForTests(online: boolean): void {
    this.online = online;
  }
}
