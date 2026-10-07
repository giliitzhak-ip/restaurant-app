import type { SyncOp } from '../types';
import { kvGet, kvSet } from './storage';
import { newId } from './id';
import { STANDALONE, apiUrl } from './config';

/**
 * תור סנכרון מול השרת. כל שינוי נשמר מקומית מיד ונכנס לתור.
 * אם אין רשת – התור נשמר ומנסה שוב מאוחר יותר. אין אובדן נתונים.
 */

const QUEUE_KEY = 'sync-queue';

export type SyncListener = (pending: number, online: boolean) => void;

class SyncQueue {
  private queue: SyncOp[] = [];
  private listeners = new Set<SyncListener>();
  private flushing = false;
  private loaded = false;
  /** אסימון ההתחברות הנוכחי. ללא אסימון אין סנכרון, אך גם אין אובדן נתונים. */
  private token: string | null = null;
  /** true כאשר השרת דחה מחוסר הרשאה – התור ממתין ואינו נזרק. */
  private blocked = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.queue = (await kvGet<SyncOp[]>(QUEUE_KEY)) ?? [];
    this.loaded = true;
    this.emit();
  }

  subscribe(fn: SyncListener): () => void {
    this.listeners.add(fn);
    fn(this.queue.length, this.isOnline());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.queue.length, this.isOnline());
  }

  isOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  get pending(): number {
    return this.queue.length;
  }

  get isBlocked(): boolean {
    return this.blocked;
  }

  /** נקרא בהתחברות ובהתנתקות. החלפת משתמש מחדשת את ניסיון הסנכרון. */
  setToken(token: string | null): void {
    this.token = token;
    this.blocked = false;
    if (token) void this.flush();
  }

  async enqueue(entity: string, entityId: string, payload: unknown): Promise<void> {
    await this.add({ entity, entityId, payload });
  }

  /**
   * מחיקה נכנסת לאותו תור. בלעדיה המחיקה נשארת במכשיר אחד בלבד,
   * והרשומה חוזרת בכל קריאה מהשרת.
   */
  async enqueueDelete(entity: string, entityId: string): Promise<void> {
    await this.add({ entity, entityId, payload: null, deleted: true });
  }

  private async add(
    op: { entity: string; entityId: string; payload: unknown; deleted?: boolean },
  ): Promise<void> {
    // בבנייה ללא שרת אין למי לסנכרן; הנתונים נשמרים במכשיר בלבד.
    if (STANDALONE) return;
    await this.load();
    /* איחוד: פעולה חדשה על אותה ישות מחליפה את הקודמת (המצב המלא נשלח בכל פעם).
       גם מחיקה מחליפה עדכון ממתין – אין טעם לשלוח מצב של רשומה שנמחקה. */
    this.queue = this.queue.filter((x) => !(x.entity === op.entity && x.entityId === op.entityId));
    this.queue.push({
      id: newId('op'),
      entity: op.entity,
      entityId: op.entityId,
      payload: op.payload,
      ...(op.deleted ? { deleted: true } : {}),
      at: new Date().toISOString(),
      tries: 0,
    });
    await kvSet(QUEUE_KEY, this.queue);
    this.emit();
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.isOnline() || this.queue.length === 0) return;
    if (!this.token || this.blocked) return;  // אין למי לשלוח – התור ממתין
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const op = this.queue[0];
        try {
          const res = await fetch(apiUrl('/api/sync'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
            },
            body: JSON.stringify({
              entity: op.entity,
              entityId: op.entityId,
              payload: op.payload,
              ...(op.deleted ? { deleted: true } : {}),
            }),
          });
          if (!res.ok) {
            /* 401/403: אין התחברות, או שהעסק ממתין לאישור / המנוי פג.
               התור נשמר כפי שהוא – שום רשומה אינה נזרקת, והסנכרון
               יתחדש מעצמו ברגע שתהיה גישה. */
            if (res.status === 401 || res.status === 403) {
              this.blocked = true;
              break;
            }
            if (res.status >= 400 && res.status < 500) {
              // ולידציה נכשלה בצד שרת – מוציאים מהתור כדי לא להיתקע, המידע נשמר מקומית
              this.queue.shift();
              await kvSet(QUEUE_KEY, this.queue);
              this.emit();
              continue;
            }
            break;
          }
          this.blocked = false;
          this.queue.shift();
          await kvSet(QUEUE_KEY, this.queue);
          this.emit();
        } catch {
          op.tries += 1;
          break; // אין רשת – נמשיך בניסיון הבא
        }
      }
    } finally {
      this.flushing = false;
      this.emit();
    }
  }
}

export const syncQueue = new SyncQueue();

export function startSyncWatchers(): void {
  if (typeof window === 'undefined' || STANDALONE) return;
  void syncQueue.load().then(() => syncQueue.flush());
  window.addEventListener('online', () => void syncQueue.flush());
  window.addEventListener('offline', () => void syncQueue.flush());
  window.setInterval(() => void syncQueue.flush(), 30000);
}
