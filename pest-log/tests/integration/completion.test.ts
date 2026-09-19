import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminClient, SEED, serviceClient, userClient } from '../setup/pgClient';
import { validateForCompletion } from '@/schema/pestLog';
import { validDwellingLog, validLogWithAssistant } from '../fixtures/sampleLog';

/**
 * בדיקות אינטגרציה מול Postgres אמיתי: יצירה, השלמה אטומית, מספור עוקב,
 * נעילה, תיקון ותקופת שמירה.
 */

const NOW = { serverNow: new Date('2026-09-11T00:00:00Z') };

let admin: pg.Client;
let service: pg.Client;
let user: pg.Client;

// חיבור אחד לכל תפקיד לכל הקובץ: פתיחת חיבור לכל בדיקה מרוקנת את
// מכסת החיבורים של Postgres.
beforeAll(async () => {
  admin = await adminClient();
  service = await serviceClient();
  user = await userClient(SEED.userAExterminator);
});

afterAll(async () => {
  await Promise.allSettled([admin?.end(), service?.end(), user?.end()]);
});

/**
 * ניקוי בין בדיקות. TRUNCATE ולא DELETE, כי הטריגרים שמונעים מחיקת יומן
 * ועדכון audit הם טריגרי שורה — וזה בדיוק מה שהם אמורים לעשות.
 */
async function cleanup(): Promise<void> {
  await admin.query(`truncate
    public.audit_events,
    public.signatures,
    public.assistant_exterminators,
    public.pesticide_applications,
    public.prevention_actions,
    public.pest_findings,
    public.bait_stations,
    public.attachments,
    public.sync_operations,
    public.pest_logs
    cascade`);
  await admin.query('update public.organizations set next_log_serial = 1');
}

/** מכין תוכן שעבר ולידציה, עם חתימות שכבר "הועלו" לאחסון. */
function validatedContent(fixture = validDwellingLog()): Record<string, unknown> {
  const result = validateForCompletion(fixture, NOW);
  if (!result.ok) throw new Error(`fixture לא תקין: ${JSON.stringify(result.problems)}`);
  const content = result.data as unknown as Record<string, unknown>;

  // שירות השרת מעלה את החתימות לאחסון לפני קריאת ה-RPC.
  const signatures = content.signatures as Record<string, Record<string, unknown>>;
  for (const role of Object.keys(signatures)) {
    delete signatures[role]!.dataUrl;
    signatures[role]!.storagePath = `${SEED.orgA}/logs/x/signatures/${role}.png`;
  }
  const assistants = (content.assistants ?? []) as Array<Record<string, unknown>>;
  assistants.forEach((assistant, index) => {
    const signature = assistant.signature as Record<string, unknown>;
    delete signature.dataUrl;
    signature.storagePath = `${SEED.orgA}/logs/x/signatures/assistant-${index}.png`;
  });

  return content;
}

async function createDraft(): Promise<string> {
  const result = await user.query(
    `insert into public.pest_logs (organization_id, content) values ($1, '{}'::jsonb) returning id`,
    [SEED.orgA],
  );
  return result.rows[0].id as string;
}

async function complete(logId: string, key: string, content = validatedContent()) {
  return service.query(`select * from public.complete_pest_log($1, $2::jsonb, $3, $4, $5)`, [
    logId,
    JSON.stringify(content),
    key,
    SEED.userAExterminator,
    'test',
  ]);
}

describe('יצירת טיוטה', () => {
  beforeEach(cleanup);

  it('משתמש יכול ליצור טיוטה בארגון שלו', async () => {
    const logId = await createDraft();
    const result = await user.query('select status, serial_number, snapshot from public.pest_logs where id = $1', [logId]);
    expect(result.rows[0].status).toBe('draft');
    expect(result.rows[0].serial_number).toBeNull();
    expect(result.rows[0].snapshot).toBeNull();
  });

  it('לא ניתן ליצור יומן שמתחזה ליומן שהושלם', async () => {
    await expect(
      user.query(
        `insert into public.pest_logs (organization_id, status, serial_number) values ($1, 'completed', 999)`,
        [SEED.orgA],
      ),
    ).rejects.toThrow();
  });

  it('שמירת טיוטה דרך ה-RPC מחזירה גרסה עולה', async () => {
    const logId = await createDraft();
    const first = await user.query(
      `select version from public.upsert_pest_log_draft($1, $2, $3::jsonb, null, $4, now(), null, null, null)`,
      [logId, SEED.orgA, JSON.stringify({ step: 1 }), 'idem-draft-0001'],
    );
    const second = await user.query(
      `select version, content from public.upsert_pest_log_draft($1, $2, $3::jsonb, $4, $5, now(), null, null, null)`,
      [logId, SEED.orgA, JSON.stringify({ step: 2 }), first.rows[0].version, 'idem-draft-0002'],
    );
    expect(Number(second.rows[0].version)).toBeGreaterThan(Number(first.rows[0].version));
    expect(second.rows[0].content).toEqual({ step: 2 });
  });

  it('גרסה לא מעודכנת מוחזרת כהתנגשות (P0004) ולא דורסת', async () => {
    const logId = await createDraft();
    await user.query(
      `select * from public.upsert_pest_log_draft($1, $2, $3::jsonb, null, $4, now(), null, null, null)`,
      [logId, SEED.orgA, JSON.stringify({ step: 1 }), 'idem-conflict-1'],
    );
    // גרסה 0 כבר לא עדכנית.
    await expect(
      user.query(
        `select * from public.upsert_pest_log_draft($1, $2, $3::jsonb, 0, $4, now(), null, null, null)`,
        [logId, SEED.orgA, JSON.stringify({ step: 99 }), 'idem-conflict-2'],
      ),
    ).rejects.toMatchObject({ code: 'P0004' });

    const after = await user.query('select content from public.pest_logs where id = $1', [logId]);
    expect(after.rows[0].content).toEqual({ step: 1 });
  });
});

describe('השלמת יומן — פעולה אטומית', () => {
  beforeEach(cleanup);

  it('ההשלמה מקצה מספר סידורי, snapshot, hash וזמן השלמה', async () => {
    const logId = await createDraft();
    const result = await complete(logId, 'idem-complete-0001');
    const row = result.rows[0];

    expect(row.status).toBe('completed');
    expect(Number(row.serial_number)).toBe(1);
    expect(row.document_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.completed_at).toBeTruthy();
    expect(row.snapshot.meta.serialNumber).toBe(1);
    // זמן ההשלמה נקבע בשרת, לא בלקוח.
    expect(row.snapshot.meta.completedAt).toBeTruthy();
  });

  it('המספר הסידורי עוקב ואינו חוזר', async () => {
    const serials: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const logId = await createDraft();
      const result = await complete(logId, `idem-serial-${index}-aaaa`);
      serials.push(Number(result.rows[0].serial_number));
    }
    expect(serials).toEqual([1, 2, 3, 4, 5]);
  });

  it('המספור נפרד לכל ארגון', async () => {
    const logA = await createDraft();
    await complete(logA, 'idem-org-a-0001');

    const orgBLog = await admin.query(
      `insert into public.pest_logs (organization_id, content) values ($1, '{}'::jsonb) returning id`,
      [SEED.orgB],
    );
    const contentB = validatedContent();
    const signatures = contentB.signatures as Record<string, Record<string, unknown>>;
    for (const role of Object.keys(signatures)) {
      signatures[role]!.storagePath = `${SEED.orgB}/logs/x/${role}.png`;
    }
    const resultB = await service.query(`select * from public.complete_pest_log($1, $2::jsonb, $3, $4, $5)`, [
      orgBLog.rows[0].id,
      JSON.stringify(contentB),
      'idem-org-b-0001',
      SEED.userBOwner,
      'test',
    ]);
    // ארגון ב׳ מתחיל גם הוא מ-1.
    expect(Number(resultB.rows[0].serial_number)).toBe(1);
  });

  it('השלמות מקבילות אינן מקצות אותו מספר פעמיים', async () => {
    // יצירה סדרתית: אותו חיבור pg אינו מריץ שתי שאילתות במקביל.
    const logIds: string[] = [];
    for (let index = 0; index < 4; index += 1) logIds.push(await createDraft());
    // כל השלמה בחיבור נפרד, כדי שהן ירוצו באמת במקביל.
    const clients = await Promise.all(logIds.map(() => serviceClient()));
    try {
      const results = await Promise.all(
        logIds.map((logId, index) =>
          clients[index]!.query(`select * from public.complete_pest_log($1, $2::jsonb, $3, $4, $5)`, [
            logId,
            JSON.stringify(validatedContent()),
            `idem-parallel-${index}-aaaa`,
            SEED.userAExterminator,
            'test',
          ]),
        ),
      );
      const serials = results.map((result) => Number(result.rows[0].serial_number)).sort((a, b) => a - b);
      expect(serials).toEqual([1, 2, 3, 4]);
      expect(new Set(serials).size).toBe(4);
    } finally {
      await Promise.allSettled(clients.map((client) => client.end()));
    }
  });

  it('אותו idempotency key מחזיר את אותה תוצאה ולא מקצה מספר חדש', async () => {
    const logId = await createDraft();
    const first = await complete(logId, 'idem-repeat-0001');
    const second = await complete(logId, 'idem-repeat-0001');

    expect(Number(second.rows[0].serial_number)).toBe(Number(first.rows[0].serial_number));
    expect(second.rows[0].document_hash).toBe(first.rows[0].document_hash);

    const counter = await admin.query('select next_log_serial from public.organizations where id = $1', [SEED.orgA]);
    expect(Number(counter.rows[0].next_log_serial)).toBe(2);
  });

  it('idempotency key שונה על יומן שהושלם נדחה', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-different-0001');
    await expect(complete(logId, 'idem-different-0002')).rejects.toThrow(/כבר הושלם/);
  });

  it('idempotency key קצר נדחה', async () => {
    const logId = await createDraft();
    await expect(complete(logId, 'short')).rejects.toThrow(/idempotency/i);
  });

  it('השלמה כותבת את שורות הבת המנורמלות', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-children-0001', validatedContent(validLogWithAssistant()));

    const findings = await admin.query('select count(*)::int as n from public.pest_findings where pest_log_id = $1', [logId]);
    const prevention = await admin.query('select count(*)::int as n from public.prevention_actions where pest_log_id = $1', [logId]);
    const applications = await admin.query('select count(*)::int as n from public.pesticide_applications where pest_log_id = $1', [logId]);
    const assistants = await admin.query('select count(*)::int as n from public.assistant_exterminators where pest_log_id = $1', [logId]);
    const signatures = await admin.query('select signer_role from public.signatures where pest_log_id = $1 order by signer_role', [logId]);

    expect(findings.rows[0].n).toBe(1);
    expect(prevention.rows[0].n).toBe(2);
    expect(applications.rows[0].n).toBe(1);
    expect(assistants.rows[0].n).toBe(1);
    // מדביר, מדביר מסייע ומקבל היומן.
    expect(signatures.rows.map((row) => row.signer_role)).toEqual(['assistant', 'exterminator', 'recipient']);
  });

  it('השלמה רושמת audit event', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-audit-0001');
    const audit = await admin.query(
      `select action, metadata from public.audit_events where entity_id = $1 and action = 'pest_log.completed'`,
      [logId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].metadata.serialNumber).toBe(1);
    expect(audit.rows[0].metadata.documentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('חתימה שלא הועלתה לאחסון חוסמת השלמה', async () => {
    const logId = await createDraft();
    const content = validatedContent();
    delete (content.signatures as Record<string, Record<string, unknown>>).exterminator!.storagePath;
    await expect(complete(logId, 'idem-nosig-0001', content)).rejects.toThrow(/חתימת המדביר/);
  });

  it('ה-hash זהה לחישוב מחדש של ה-snapshot', async () => {
    const logId = await createDraft();
    const result = await complete(logId, 'idem-hash-0001');
    const recomputed = await admin.query('select app.document_hash(snapshot) as h from public.pest_logs where id = $1', [logId]);
    expect(recomputed.rows[0].h).toBe(result.rows[0].document_hash);
  });

  it('ה-hash אינו תלוי בסדר המפתחות ב-JSON', async () => {
    const a = await admin.query(`select app.document_hash('{"a":1,"b":{"c":2,"d":3}}'::jsonb) as h`);
    const b = await admin.query(`select app.document_hash('{"b":{"d":3,"c":2},"a":1}'::jsonb) as h`);
    expect(a.rows[0].h).toBe(b.rows[0].h);
  });

  it('לא ניתן להשלים יומן שכבר בוטל', async () => {
    const logId = await createDraft();
    await user.query('select * from public.cancel_pest_log($1, $2, $3)', [logId, 'בוטל לבקשת המזמין', SEED.userAExterminator]);
    await expect(complete(logId, 'idem-cancelled-0001')).rejects.toThrow(/בסטטוס/);
  });

  it('הלקוח אינו יכול לקרוא ל-complete_pest_log בעצמו', async () => {
    const logId = await createDraft();
    await expect(
      user.query(`select * from public.complete_pest_log($1, '{}'::jsonb, $2)`, [logId, 'idem-direct-0001']),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('נעילת יומן שהושלם', () => {
  beforeEach(cleanup);

  it('לא ניתן לשנות את תוכן היומן', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-lock-0001');
    await expect(
      admin.query(`update public.pest_logs set content = '{"hacked":true}'::jsonb where id = $1`, [logId]),
    ).rejects.toThrow(/אינו ניתן לשינוי/);
  });

  it('לא ניתן לשנות את המספר הסידורי', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-lock-0002');
    await expect(
      admin.query('update public.pest_logs set serial_number = 999 where id = $1', [logId]),
    ).rejects.toThrow(/אינו ניתן לשינוי/);
  });

  it('לא ניתן למחוק יומן פיזית', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-lock-0003');
    await expect(admin.query('delete from public.pest_logs where id = $1', [logId])).rejects.toThrow(/לא ניתן למחוק/);
  });

  it('לא ניתן לשנות את שורות הבת של יומן שהושלם', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-lock-0004');
    await expect(
      admin.query(`update public.pest_findings set pest_name = 'שונה' where pest_log_id = $1`, [logId]),
    ).rejects.toThrow(/יומן שהושלם/);
    await expect(admin.query('delete from public.pest_findings where pest_log_id = $1', [logId])).rejects.toThrow(
      /יומן שהושלם/,
    );
  });

  it('RLS אינו מאפשר ללקוח לעדכן יומן שהושלם', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-lock-0005');
    const result = await user.query(`update public.pest_logs set content = '{}'::jsonb where id = $1`, [logId]);
    // המדיניות מסננת את השורה — אין שורות שהתעדכנו, ואין שגיאה.
    expect(result.rowCount).toBe(0);
  });

  it('audit_events הוא append-only', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-audit-immutable');
    await expect(admin.query(`update public.audit_events set action = 'x' where entity_id = $1`, [logId])).rejects.toThrow(
      /append-only/,
    );
    await expect(admin.query('delete from public.audit_events where entity_id = $1', [logId])).rejects.toThrow(
      /append-only/,
    );
  });
});

describe('גרסת תיקון', () => {
  beforeEach(cleanup);

  it('תיקון יוצר טיוטה חדשה מקושרת ושומר את המקור', async () => {
    const logId = await createDraft();
    const original = await complete(logId, 'idem-correct-0001');

    const correction = await service.query('select * from public.open_pest_log_correction($1, $2, $3, $4)', [
      logId,
      'תוקן מספר האצווה לאחר בדיקה חוזרת',
      SEED.userAExterminator,
      'idem-correction-key-1',
    ]);
    const row = correction.rows[0];

    expect(row.status).toBe('draft');
    expect(row.corrects_log_id).toBe(logId);
    expect(Number(row.document_version)).toBe(2);
    expect(row.correction_reason).toContain('אצווה');
    expect(row.serial_number).toBeNull();

    // המקור לא נגע בו.
    const source = await admin.query('select status, serial_number, document_hash from public.pest_logs where id = $1', [logId]);
    expect(source.rows[0].status).toBe('completed');
    expect(Number(source.rows[0].serial_number)).toBe(Number(original.rows[0].serial_number));
    expect(source.rows[0].document_hash).toBe(original.rows[0].document_hash);
  });

  it('גרסת התיקון מקבלת מספר סידורי חדש בהשלמתה', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-correct-0002');
    const correction = await service.query('select * from public.open_pest_log_correction($1, $2, $3, null)', [
      logId,
      'תיקון לדוגמה',
      SEED.userAExterminator,
    ]);
    const correctionId = correction.rows[0].id as string;

    const completed = await complete(correctionId, 'idem-correct-complete-1');
    expect(Number(completed.rows[0].serial_number)).toBe(2);
    expect(Number(completed.rows[0].document_version)).toBe(2);
    expect(completed.rows[0].snapshot.meta.correctsLogId).toBe(logId);
  });

  it('החתימות אינן מועתקות לגרסת התיקון', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-correct-0003');
    const correction = await service.query('select * from public.open_pest_log_correction($1, $2, $3, null)', [
      logId,
      'תיקון לדוגמה',
      SEED.userAExterminator,
    ]);
    expect(correction.rows[0].content.signatures).toBeUndefined();
    expect(correction.rows[0].content.meta).toBeUndefined();
  });

  it('תיקון בלי סיבה נדחה', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-correct-0004');
    await expect(
      service.query('select * from public.open_pest_log_correction($1, $2, $3, null)', ['' + logId, '  ', SEED.userAExterminator]),
    ).rejects.toThrow(/סיבת התיקון/);
  });

  it('לא ניתן לפתוח תיקון לטיוטה', async () => {
    const logId = await createDraft();
    await expect(
      service.query('select * from public.open_pest_log_correction($1, $2, $3, null)', [logId, 'סיבה', SEED.userAExterminator]),
    ).rejects.toThrow(/שהושלם/);
  });

  it('אותו idempotency key אינו יוצר שתי גרסאות תיקון', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-correct-0005');
    const first = await service.query('select * from public.open_pest_log_correction($1, $2, $3, $4)', [
      logId, 'תיקון', SEED.userAExterminator, 'idem-corr-same-1',
    ]);
    const second = await service.query('select * from public.open_pest_log_correction($1, $2, $3, $4)', [
      logId, 'תיקון', SEED.userAExterminator, 'idem-corr-same-1',
    ]);
    expect(second.rows[0].id).toBe(first.rows[0].id);
  });
});

describe('תקופת שמירה ומחיקה רכה', () => {
  beforeEach(cleanup);

  it('לא ניתן למחוק יומן שהושלם לפני שעברו שלוש שנים', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-retention-0001');
    const manager = await userClient(SEED.userAManager);
    try {
      await expect(
        manager.query('select * from public.soft_delete_pest_log($1, $2)', [logId, 'בקשת מחיקה']),
      ).rejects.toThrow(/שנים לפחות/);
    } finally {
      await manager.end();
    }
  });

  it('מדביר שאינו מנהל אינו יכול למחוק', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-retention-0002');
    await expect(user.query('select * from public.soft_delete_pest_log($1, $2)', [logId, 'בקשה'])).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('לאחר שלוש שנים מנהל יכול למחוק רכות, עם audit', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-retention-0003');
    // הזזת מועד ההשלמה לאחור, בעקיפת הטריגר, כדי לדמות מעבר זמן.
    await admin.query('alter table public.pest_logs disable trigger trg_pest_logs_immutable');
    await admin.query(`update public.pest_logs set completed_at = now() - interval '4 years' where id = $1`, [logId]);
    await admin.query('alter table public.pest_logs enable trigger trg_pest_logs_immutable');

    const manager = await userClient(SEED.userAManager);
    try {
      const result = await manager.query('select * from public.soft_delete_pest_log($1, $2)', [logId, 'עברה תקופת השמירה']);
      expect(result.rows[0].deleted_at).toBeTruthy();
      // מחיקה רכה: הרשומה עצמה נשארת.
      const still = await admin.query('select id, snapshot is not null as has_snapshot from public.pest_logs where id = $1', [logId]);
      expect(still.rowCount).toBe(1);
      expect(still.rows[0].has_snapshot).toBe(true);
    } finally {
      await manager.end();
    }

    const audit = await admin.query(
      `select action from public.audit_events where entity_id = $1 and action = 'pest_log.soft_deleted'`,
      [logId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('מחיקה בלי סיבה נדחית', async () => {
    const logId = await createDraft();
    const manager = await userClient(SEED.userAManager);
    try {
      await expect(manager.query('select * from public.soft_delete_pest_log($1, $2)', [logId, ''])).rejects.toThrow(/סיבה/);
    } finally {
      await manager.end();
    }
  });
});

describe('ביטול טיוטה', () => {
  beforeEach(cleanup);

  it('ביטול מחייב סיבה ומשנה סטטוס', async () => {
    const logId = await createDraft();
    await expect(user.query('select * from public.cancel_pest_log($1, $2)', [logId, ''])).rejects.toThrow(/סיבה/);

    const result = await user.query('select * from public.cancel_pest_log($1, $2)', [logId, 'המזמין ביטל את ההזמנה']);
    expect(result.rows[0].status).toBe('cancelled');
    expect(result.rows[0].cancellation_reason).toContain('ביטל');
  });

  it('לא ניתן לבטל יומן שהושלם', async () => {
    const logId = await createDraft();
    await complete(logId, 'idem-cancel-0001');
    await expect(user.query('select * from public.cancel_pest_log($1, $2)', [logId, 'סיבה'])).rejects.toThrow(/טיוטה/);
  });
});
