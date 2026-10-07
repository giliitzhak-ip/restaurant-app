import type { SyncOp } from '../types';
import { kvGet, kvSet } from './storage';
import { newId } from './id';
import { STANDALONE, apiUrl } from './config';

/**
 * תור סנכרון מול השרת. כל שינוי נשמר מקומית מיד ונכנס לתור.
 * אם אין רשת – התור נשמר ומנסה שוב מאוחר יותר. אין אובדן נתונים.
 *
 * כלל: פעולה אינה נזרקת בשקט. דחייה מצד השרת עוברת לרשימת "נדחו"
 * שמוצגת למשתמש, כדי שלא יישאר עם נתון שקיים במכשיר בלבד בלי לדעת.
 */

const QUEUE_KEY = 'sync-queue';
const REJECTED_KEY = 'sync-rejected';
const CURSOR_KEY = 'sync-cursor';

/** פעולה שהשרת דחה מטעמי תוכן (400/409/422). אינה נזרקת. */
export interface RejectedOp {
  op: SyncOp;
  status: number;
  errors: string[];
  at: string;
}

export interface SyncStatus {
  pending: number;
  online: boolean;
  /** true כשאין הרשאה – התור ממתין ואינו נזרק. */
  blocked: boolean;
  rejected: RejectedOp[];
}

/** תוצאת משיכה מהשרת. */
export interface PullResult {
  items: Record<string, Record<string, unknown>[]>;
  deleted: Record<string, string[]>;
  cursor: string;
  truncated: boolean;
}

export type SyncListener = (status: SyncStatus) => void;

/**
 * קריאת גוף התשובה עד הסוף גם כשאין בו צורך.
 * תשובת fetch שגופה לא נקרא נשארת "בדרך" מבחינת הדפדפן: היא מחזיקה חיבור,
 * וגם מונעת מהעמוד להגיע למצב רגיעה ברשת.
 */
async function drain(res: Response): Promise<void> {
  try {
    await res.arrayBuffer();
  } catch {
    /* אין גוף לקרוא */
  }
}

class SyncQueue {
  private queue: SyncOp[] = [];
  private rejected: RejectedOp[] = [];
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
    this.rejected = (await kvGet<RejectedOp[]>(REJECTED_KEY)) ?? [];
    this.loaded = true;
    this.emit();
  }

  subscribe(fn: SyncListener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  get status(): SyncStatus {
    return {
      pending: this.queue.length,
      online: this.isOnline(),
      blocked: this.blocked,
      rejected: this.rejected,
    };
  }

  private emit(): void {
    const status = this.status;
    for (const fn of this.listeners) fn(status);
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

  get rejections(): RejectedOp[] {
    return this.rejected;
  }

  /** האם יש שינוי מקומי שעדיין לא הגיע לשרת. קובע מי גובר במיזוג. */
  hasPending(entity: string, entityId: string): boolean {
    return this.queue.some((op) => op.entity === entity && op.entityId === entityId)
      || this.rejected.some((r) => r.op.entity === entity && r.op.entityId === entityId);
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
   * והרשומה חוזרת בכל משיכה מהשרת.
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
    /* שינוי חדש על ישות שנדחתה בעבר מחליף את הדחייה:
       המשתמש תיקן את הנתון, ואין להציג לו שגיאה ישנה. */
    if (this.rejected.length > 0) {
      const kept = this.rejected.filter(
        (r) => !(r.op.entity === op.entity && r.op.entityId === op.entityId),
      );
      if (kept.length !== this.rejected.length) {
        this.rejected = kept;
        await kvSet(REJECTED_KEY, this.rejected);
      }
    }
    await kvSet(QUEUE_KEY, this.queue);
    this.emit();
    void this.flush();
  }

  /** מחזיר פעולות שנדחו אל התור, לניסיון חדש לאחר תיקון בשרת. */
  async retryRejected(): Promise<void> {
    await this.load();
    if (this.rejected.length === 0) return;
    const back = this.rejected.map((r) => ({ ...r.op, tries: 0 }));
    this.rejected = [];
    for (const op of back) {
      this.queue = this.queue.filter((x) => !(x.entity === op.entity && x.entityId === op.entityId));
      this.queue.push(op);
    }
    await kvSet(REJECTED_KEY, this.rejected);
    await kvSet(QUEUE_KEY, this.queue);
    this.emit();
    void this.flush();
  }

  /** הסרת דחייה מהתצוגה. הנתון עצמו נשאר במכשיר. */
  async dismissRejection(opId: string): Promise<void> {
    await this.load();
    const kept = this.rejected.filter((r) => r.op.id !== opId);
    if (kept.length === this.rejected.length) return;
    this.rejected = kept;
    await kvSet(REJECTED_KEY, this.rejected);
    this.emit();
  }

  private async reject(op: SyncOp, status: number, errors: string[]): Promise<void> {
    this.rejected = [
      ...this.rejected.filter((r) => !(r.op.entity === op.entity && r.op.entityId === op.entityId)),
      { op, status, errors: errors.length ? errors : ['השרת דחה את השינוי.'], at: new Date().toISOString() },
    ].slice(-50);
    await kvSet(REJECTED_KEY, this.rejected);
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
              // מזהה הפעולה: מאפשר לשרת לזהות שליחה חוזרת של אותו שינוי
              'X-Sync-Op': op.id,
            },
            body: JSON.stringify({
              entity: op.entity,
              entityId: op.entityId,
              payload: op.payload,
              opId: op.id,
              ...(op.deleted ? { deleted: true } : {}),
            }),
          });
          if (!res.ok) {
            /* 401/403: אין התחברות, או שהעסק ממתין לאישור / המנוי פג.
               התור נשמר כפי שהוא – שום רשומה אינה נזרקת, והסנכרון
               יתחדש מעצמו ברגע שתהיה גישה. */
            if (res.status === 401 || res.status === 403) {
              await drain(res);
              this.blocked = true;
              break;
            }
            if (res.status >= 400 && res.status < 500) {
              /* דחיית תוכן (400/409/422): השינוי אינו נזרק בשקט.
                 הוא יוצא מהתור כדי לא לחסום אותו, ועובר לרשימת הדחיות
                 שמוצגת למשתמש עם נימוק השרת. */
              let errors: string[] = [];
              try {
                const body = (await res.json()) as { errors?: string[] };
                errors = Array.isArray(body.errors) ? body.errors : [];
              } catch {
                /* גוף לא קריא – נציג הודעה כללית */
              }
              await this.reject(op, res.status, errors);
              this.queue.shift();
              await kvSet(QUEUE_KEY, this.queue);
              this.emit();
              continue;
            }
            await drain(res);
            break;
          }
          await drain(res);
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

  async readCursor(): Promise<string> {
    return (await kvGet<string>(CURSOR_KEY)) ?? '';
  }

  async writeCursor(cursor: string): Promise<void> {
    await kvSet(CURSOR_KEY, cursor);
  }

  /**
   * משיכת שינויים מהשרת. מחזיר null כשאין למי לפנות או שהבקשה נכשלה –
   * משיכה שנכשלה אינה משנה דבר במכשיר.
   */
  async pull(): Promise<PullResult | null> {
    if (STANDALONE || !this.token || !this.isOnline()) return null;
    const since = await this.readCursor();
    try {
      const res = await fetch(apiUrl(`/api/sync/pull?since=${encodeURIComponent(since)}`), {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) {
        await drain(res);
        if (res.status === 401 || res.status === 403) this.blocked = true;
        return null;
      }
      const body = (await res.json()) as PullResult & { ok: boolean };
      return {
        items: body.items ?? {},
        deleted: body.deleted ?? {},
        cursor: body.cursor ?? since,
        truncated: Boolean(body.truncated),
      };
    } catch {
      return null;   // אין רשת
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
