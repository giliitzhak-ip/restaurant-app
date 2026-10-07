/**
 * תור הסנכרון: מחיקה חייבת לעבור בתור כמו כל שינוי אחר.
 * בלעדיה המחיקה נשארת במכשיר אחד, והרשומה חוזרת מהשרת.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncQueue } from '../lib/sync';

interface SentBody {
  entity: string;
  entityId: string;
  payload: unknown;
  deleted?: boolean;
}

const sent: SentBody[] = [];

function mockFetch(status = 200): void {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as SentBody);
    return { ok: status < 400, status } as Response;
  }));
}

/** ממתין עד שהתור מתרוקן, או נכשל בזמן. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 5));
    if (syncQueue.pending === 0) return;
  }
}

describe('תור הסנכרון', () => {
  beforeEach(async () => {
    sent.length = 0;
    localStorage.clear();
    syncQueue.setToken('test-token');
    mockFetch();
    await settle();
    sent.length = 0;
  });

  it('שולח מחיקה עם סימון deleted', async () => {
    await syncQueue.enqueueDelete('signatures', 'sgn_1');
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ entity: 'signatures', entityId: 'sgn_1', deleted: true });
  });

  it('עדכון רגיל נשלח בלי סימון מחיקה', async () => {
    await syncQueue.enqueueDelete('signatures', 'sgn_keep');
    await settle();
    sent.length = 0;
    await syncQueue.enqueue('signatures', 'sgn_2', { id: 'sgn_2', role: 'customer' });
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].deleted).toBeUndefined();
    expect(sent[0].payload).toMatchObject({ role: 'customer' });
  });

  it('מחיקה מחליפה עדכון ממתין על אותה ישות, ולא נשלח מצב של רשומה שנמחקה', async () => {
    // ללא רשת: שתי הפעולות ממתינות בתור
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await syncQueue.enqueue('signatures', 'sgn_3', { id: 'sgn_3', role: 'customer' });
    await syncQueue.enqueueDelete('signatures', 'sgn_3');
    expect(syncQueue.pending).toBe(1);

    mockFetch();
    await syncQueue.flush();
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].deleted).toBe(true);
  });

  it('מחיקה שנדחתה בהרשאה נשארת בתור ואינה נזרקת', async () => {
    mockFetch(403);
    await syncQueue.enqueueDelete('signatures', 'sgn_4');
    await settle();
    expect(syncQueue.pending).toBe(1);
    expect(syncQueue.isBlocked).toBe(true);

    // חידוש ההרשאה מחדש את השליחה
    mockFetch();
    syncQueue.setToken('fresh-token');
    await settle();
    expect(syncQueue.pending).toBe(0);
    expect(sent.at(-1)).toMatchObject({ entityId: 'sgn_4', deleted: true });
  });
});
