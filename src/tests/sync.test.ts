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

function mockFetch(status = 200, errors: string[] = []): void {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as SentBody);
    return {
      ok: status < 400,
      status,
      json: async () => ({ ok: status < 400, errors }),
    } as Response;
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
    for (const r of syncQueue.rejections) await syncQueue.dismissRejection(r.op.id);
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

  it('כל פעולה נושאת מזהה, כדי שהשרת יזהה שליחה חוזרת', async () => {
    await syncQueue.enqueue('customers', 'cus_op', { id: 'cus_op', name: 'א', address: 'ב' });
    await settle();
    expect(sent[0]).toHaveProperty('opId');
    expect(String((sent[0] as unknown as { opId: string }).opId)).toMatch(/^op_/);
  });

  it('דחיית תוכן (422) אינה נזרקת בשקט אלא עוברת לרשימת הדחיות', async () => {
    mockFetch(422, ['שדה חובה חסר: name']);
    await syncQueue.enqueueDelete('customers', 'cus_bad');
    await settle();
    expect(syncQueue.pending).toBe(0);              // אינה חוסמת את התור
    expect(syncQueue.rejections).toHaveLength(1);   // ואינה נעלמת
    expect(syncQueue.rejections[0].status).toBe(422);
    expect(syncQueue.rejections[0].errors).toEqual(['שדה חובה חסר: name']);
  });

  it('רשומה שנדחתה נחשבת כשינוי מקומי ממתין, ולא נדרסת ממשיכה מהשרת', async () => {
    mockFetch(400, ['ישות לא מוכרת']);
    await syncQueue.enqueue('customers', 'cus_pend', { id: 'cus_pend' });
    await settle();
    expect(syncQueue.hasPending('customers', 'cus_pend')).toBe(true);
  });

  it('שינוי חדש על אותה רשומה מחליף דחייה קודמת', async () => {
    mockFetch(422, ['שדה חובה חסר: name']);
    await syncQueue.enqueue('customers', 'cus_fix', { id: 'cus_fix' });
    await settle();
    expect(syncQueue.rejections).toHaveLength(1);

    mockFetch();
    await syncQueue.enqueue('customers', 'cus_fix', { id: 'cus_fix', name: 'תוקן', address: 'ג' });
    await settle();
    expect(syncQueue.rejections).toHaveLength(0);
    expect(syncQueue.pending).toBe(0);
  });

  it('"נסה שוב" מחזיר דחיות לתור', async () => {
    mockFetch(422, ['נדחה']);
    await syncQueue.enqueue('tasks', 'tsk_retry', { id: 'tsk_retry' });
    await settle();
    expect(syncQueue.rejections).toHaveLength(1);

    mockFetch();
    await syncQueue.retryRejected();
    await settle();
    expect(syncQueue.rejections).toHaveLength(0);
    expect(syncQueue.pending).toBe(0);
    expect(sent.at(-1)).toMatchObject({ entityId: 'tsk_retry' });
  });
});
