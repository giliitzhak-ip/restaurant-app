import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { SyncEngine, backoffDelayMs, type OperationOutcome } from '@/lib/sync/engine';
import {
  clearLocalData,
  countFailedOperations,
  countPendingOperations,
  getDraft,
  listPendingOperations,
  putDraft,
} from '@/lib/db/idb';

/**
 * בדיקות מנוע הסנכרון מול IndexedDB אמיתי (fake-indexeddb מספק את ה-API
 * המלא). מה שנבדק: שמירה מקומית ללא קליטה, מניעת כפילויות דרך מפתח
 * אידמפוטנטיות, ואי-דריסה בהתנגשות.
 */

const ORG = '00000000-0000-4000-8000-000000000001';

async function seedDraft(id: string): Promise<void> {
  await putDraft({
    id,
    organizationId: ORG,
    content: { a: 1 },
    serverVersion: 0,
    idempotencyKey: `upsert_draft:${id}:create`,
    updatedAt: new Date().toISOString(),
    syncedAt: null,
    syncState: 'local',
    lastError: null,
    syncedFingerprint: null,
    readOnly: false,
    serialNumber: null,
    status: 'draft',
  });
}

describe('מנוע הסנכרון', () => {
  beforeEach(async () => {
    await clearLocalData();
  });

  it('backoff גדל אך חסום בגבול עליון', () => {
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(2)).toBe(4000);
    expect(backoffDelayMs(3)).toBe(8000);
    expect(backoffDelayMs(50)).toBe(5 * 60 * 1000);
  });

  it('ללא קליטה הפעולה נשמרת בתור ולא נשלחת', async () => {
    const executor = vi.fn<() => Promise<OperationOutcome>>();
    const engine = new SyncEngine(executor as never);
    engine.setOnlineForTests(false);

    await engine.enqueue('upsert_draft', 'log-1', { content: { x: 1 } });

    expect(executor).not.toHaveBeenCalled();
    expect(await countPendingOperations()).toBe(1);
    const status = await engine.status();
    expect(status.state).toBe('local');
  });

  it('חזרה לרשת שולחת את התור בלי כפילויות', async () => {
    const calls: string[] = [];
    const engine = new SyncEngine(async (operation) => {
      calls.push(operation.idempotencyKey);
      return { ok: true, serverVersion: 1 };
    });
    engine.setOnlineForTests(false);

    await seedDraft('log-1');
    // אותה פעולה נכנסת לתור שלוש פעמים עם אותו דיסקרימינטור.
    await engine.enqueue('upsert_draft', 'log-1', { content: { x: 1 } }, 'same');
    await engine.enqueue('upsert_draft', 'log-1', { content: { x: 2 } }, 'same');
    await engine.enqueue('upsert_draft', 'log-1', { content: { x: 3 } }, 'same');

    expect(await countPendingOperations()).toBe(1);

    engine.setOnlineForTests(true);
    await engine.flush();

    // נשלחה פעם אחת בלבד — אין כפילות בשרת.
    expect(calls).toHaveLength(1);
    expect(await countPendingOperations()).toBe(0);
    const draft = await getDraft('log-1');
    expect(draft?.syncState).toBe('synced');
    expect(draft?.serverVersion).toBe(1);
  });

  it('תוכן שונה יוצר פעולה נפרדת', async () => {
    const calls: string[] = [];
    const engine = new SyncEngine(async (operation) => {
      calls.push(String((operation.payload as { content: { x: number } }).content.x));
      return { ok: true };
    });

    await engine.enqueue('upsert_draft', 'log-1', { content: { x: 1 } }, 'fp1');
    await engine.enqueue('upsert_draft', 'log-1', { content: { x: 2 } }, 'fp2');
    await engine.flush();

    expect(calls.sort()).toEqual(['1', '2']);
  });

  it('התנגשות גרסאות מסומנת כשגיאה ואינה נדרסת אוטומטית', async () => {
    let attempts = 0;
    const engine = new SyncEngine(async () => {
      attempts += 1;
      return { ok: false, error: 'היומן עודכן ממקום אחר', conflict: true };
    });

    await seedDraft('log-1');
    await engine.enqueue('upsert_draft', 'log-1', { content: { x: 1 } });
    await engine.flush();

    // ניסיון אחד בלבד: התנגשות אינה נושא ל-retry אוטומטי.
    expect(attempts).toBe(1);
    expect(await countFailedOperations()).toBe(1);

    const draft = await getDraft('log-1');
    expect(draft?.syncState).toBe('error');
    expect(draft?.lastError).toContain('עודכן');

    const status = await engine.status();
    expect(status.state).toBe('error');
  });

  it('שגיאה זמנית נשארת בתור עם backoff', async () => {
    const engine = new SyncEngine(async () => ({ ok: false, error: 'נפילת רשת זמנית' }));
    await engine.enqueue('upsert_draft', 'log-1', { content: {} });
    await engine.flush();

    const operations = await listPendingOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]!.status).toBe('pending');
    expect(operations[0]!.attempts).toBe(1);
    expect(new Date(operations[0]!.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('ניסיון חוזר ידני מאפס פעולות שנכשלו', async () => {
    let shouldFail = true;
    const engine = new SyncEngine(async () =>
      shouldFail ? { ok: false, error: 'שגיאה', permanent: true } : { ok: true },
    );

    await engine.enqueue('upsert_draft', 'log-1', { content: {} });
    await engine.flush();
    expect(await countFailedOperations()).toBe(1);

    shouldFail = false;
    await engine.retryFailed();
    expect(await countFailedOperations()).toBe(0);
    expect(await countPendingOperations()).toBe(0);
  });

  it('מצב הסנכרון מדווח נכון בכל שלב', async () => {
    const engine = new SyncEngine(async () => ({ ok: true }));

    expect((await engine.status()).state).toBe('synced');

    engine.setOnlineForTests(false);
    await engine.enqueue('upsert_draft', 'log-1', { content: {} });
    expect((await engine.status()).state).toBe('local');

    engine.setOnlineForTests(true);
    await engine.flush();
    expect((await engine.status()).state).toBe('synced');
  });
});
