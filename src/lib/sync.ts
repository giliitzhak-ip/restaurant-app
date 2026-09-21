import type { SyncOp } from '../types';
import { kvGet, kvSet } from './storage';
import { newId } from './id';

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

  async enqueue(entity: string, entityId: string, payload: unknown): Promise<void> {
    await this.load();
    // איחוד: פעולה חדשה על אותה ישות מחליפה את הקודמת (המצב המלא נשלח בכל פעם)
    this.queue = this.queue.filter((op) => !(op.entity === entity && op.entityId === entityId));
    this.queue.push({ id: newId('op'), entity, entityId, payload, at: new Date().toISOString(), tries: 0 });
    await kvSet(QUEUE_KEY, this.queue);
    this.emit();
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.isOnline() || this.queue.length === 0) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const op = this.queue[0];
        try {
          const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity: op.entity, entityId: op.entityId, payload: op.payload }),
          });
          if (!res.ok) {
            if (res.status >= 400 && res.status < 500) {
              // ולידציה נכשלה בצד שרת – מוציאים מהתור כדי לא להיתקע, המידע נשמר מקומית
              this.queue.shift();
              await kvSet(QUEUE_KEY, this.queue);
              this.emit();
              continue;
            }
            break;
          }
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
  if (typeof window === 'undefined') return;
  void syncQueue.load().then(() => syncQueue.flush());
  window.addEventListener('online', () => void syncQueue.flush());
  window.addEventListener('offline', () => void syncQueue.flush());
  window.setInterval(() => void syncQueue.flush(), 30000);
}
