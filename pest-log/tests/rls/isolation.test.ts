import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminClient, SEED, userClient } from '../setup/pgClient';

/**
 * בדיקות Row Level Security — בידוד בין ארגונים.
 *
 * הבדיקות רצות בתפקיד `authenticated` עם claim של sub, בדיוק כמו
 * PostgREST ב-Supabase. superuser עוקף RLS ולכן אינו מתאים כאן.
 * מה שנבדק: משתמש מארגון א׳ לא רואה, לא משנה ולא מוחק מידע של ארגון ב׳.
 */

let admin: pg.Client;
let userA: pg.Client;
let userB: pg.Client;
let managerA: pg.Client;

/** יומן של ארגון ב׳ שמשמש כמטרה לניסיונות גישה. */
let orgBLogId: string;
let orgALogId: string;

beforeAll(async () => {
  admin = await adminClient();
  userA = await userClient(SEED.userAExterminator);
  userB = await userClient(SEED.userBOwner);
  managerA = await userClient(SEED.userAManager);
});

afterAll(async () => {
  await Promise.allSettled([admin?.end(), userA?.end(), userB?.end(), managerA?.end()]);
});

beforeEach(async () => {
  await admin.query(`truncate
    public.audit_events, public.signatures, public.assistant_exterminators,
    public.pesticide_applications, public.prevention_actions, public.pest_findings,
    public.bait_stations, public.attachments, public.sync_operations, public.pest_logs
    cascade`);

  const a = await admin.query(
    `insert into public.pest_logs (organization_id, content) values ($1, '{"org":"a"}'::jsonb) returning id`,
    [SEED.orgA],
  );
  orgALogId = a.rows[0].id as string;

  const b = await admin.query(
    `insert into public.pest_logs (organization_id, content) values ($1, '{"org":"b"}'::jsonb) returning id`,
    [SEED.orgB],
  );
  orgBLogId = b.rows[0].id as string;
});

describe('בידוד יומנים בין ארגונים', () => {
  it('משתמש רואה רק את היומנים של הארגון שלו', async () => {
    const seenByA = await userA.query('select id, organization_id from public.pest_logs');
    expect(seenByA.rowCount).toBe(1);
    expect(seenByA.rows[0].organization_id).toBe(SEED.orgA);

    const seenByB = await userB.query('select id, organization_id from public.pest_logs');
    expect(seenByB.rowCount).toBe(1);
    expect(seenByB.rows[0].organization_id).toBe(SEED.orgB);
  });

  it('שליפה ממוקדת של יומן מארגון אחר מחזירה ריק (ולא שגיאה שמגלה קיום)', async () => {
    const result = await userA.query('select id from public.pest_logs where id = $1', [orgBLogId]);
    expect(result.rowCount).toBe(0);
  });

  it('עדכון יומן של ארגון אחר לא משנה כלום', async () => {
    const result = await userA.query(`update public.pest_logs set content = '{"hacked":true}'::jsonb where id = $1`, [
      orgBLogId,
    ]);
    expect(result.rowCount).toBe(0);

    const after = await admin.query('select content from public.pest_logs where id = $1', [orgBLogId]);
    expect(after.rows[0].content).toEqual({ org: 'b' });
  });

  it('לא ניתן ליצור יומן בשם ארגון אחר', async () => {
    await expect(
      userA.query(`insert into public.pest_logs (organization_id, content) values ($1, '{}'::jsonb)`, [SEED.orgB]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('לא ניתן להעביר יומן שלי לארגון אחר', async () => {
    // ה-WITH CHECK של המדיניות דוחה את השורה החדשה בשגיאה.
    await expect(
      userA.query('update public.pest_logs set organization_id = $1 where id = $2', [SEED.orgB, orgALogId]),
    ).rejects.toMatchObject({ code: '42501' });

    const after = await admin.query('select organization_id from public.pest_logs where id = $1', [orgALogId]);
    expect(after.rows[0].organization_id).toBe(SEED.orgA);
  });

  it('ה-RPC לשמירת טיוטה חוסם כתיבה לארגון אחר', async () => {
    await expect(
      userA.query(`select * from public.upsert_pest_log_draft($1, $2, '{"x":1}'::jsonb, null, $3, now(), null, null, null)`, [
        orgBLogId,
        SEED.orgB,
        'idem-cross-org-1',
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('ה-RPC לביטול חוסם יומן של ארגון אחר', async () => {
    await expect(
      userA.query('select * from public.cancel_pest_log($1, $2)', [orgBLogId, 'ניסיון ביטול']),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('ה-RPC למחיקה רכה חוסם יומן של ארגון אחר', async () => {
    await expect(
      managerA.query('select * from public.soft_delete_pest_log($1, $2)', [orgBLogId, 'ניסיון מחיקה']),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('מחיקה פיזית של יומן חסומה גם לבעל הארגון', async () => {
    const result = await managerA.query('delete from public.pest_logs where id = $1', [orgALogId]);
    // אין מדיניות DELETE על pest_logs — אין שורות שנמחקו.
    expect(result.rowCount).toBe(0);
  });
});

describe('בידוד מזמינים, אתרים ותכשירים', () => {
  it('מזמינים של ארגון אחר אינם נראים', async () => {
    const seenByB = await userB.query('select id from public.clients');
    expect(seenByB.rowCount).toBe(0);

    const seenByA = await userA.query('select id from public.clients');
    expect(seenByA.rowCount).toBeGreaterThan(0);
  });

  it('אתרים של ארגון אחר אינם נראים', async () => {
    expect((await userB.query('select id from public.client_sites')).rowCount).toBe(0);
  });

  it('תכשירים של ארגון אחר אינם נראים', async () => {
    expect((await userB.query('select id from public.products')).rowCount).toBe(0);
  });

  it('קטלוג המזיקים מופרד בין ארגונים', async () => {
    expect((await userB.query('select id from public.pest_catalog')).rowCount).toBe(0);
    expect((await userA.query('select id from public.pest_catalog')).rowCount).toBeGreaterThan(0);
  });

  it('תבניות אזהרה מופרדות בין ארגונים', async () => {
    expect((await userB.query('select id from public.warning_templates')).rowCount).toBe(0);
  });

  it('רישיונות מופרדים בין ארגונים', async () => {
    expect((await userB.query('select id from public.pesticide_licenses')).rowCount).toBe(0);
  });

  it('לא ניתן להוסיף מזמין לארגון אחר', async () => {
    await expect(
      userB.query(`insert into public.clients (organization_id, name) values ($1, 'ניסיון')`, [SEED.orgA]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('לא ניתן לעדכן מזמין של ארגון אחר', async () => {
    const result = await userB.query(`update public.clients set name = 'שונה' where id = $1`, [SEED.clientA]);
    expect(result.rowCount).toBe(0);
  });

  it('לא ניתן למחוק תכשיר של ארגון אחר', async () => {
    const result = await userB.query('delete from public.products where id = $1', [SEED.productA]);
    expect(result.rowCount).toBe(0);
  });
});

describe('בידוד שורות הבת של יומן', () => {
  beforeEach(async () => {
    // שורות בת ליומן של ארגון ב׳, שנוצרות בעקיפת RLS (כמו שירות השרת).
    await admin.query(
      `insert into public.pest_findings
        (organization_id, pest_log_id, pest_name, identification_actions, development_stage,
         infestation_signs, finding_location, infestation_level)
       values ($1, $2, 'מזיק ב׳', 'בדיקה', 'בוגר', 'סימנים', 'מיקום', 'low')`,
      [SEED.orgB, orgBLogId],
    );
  });

  it('ממצאי ניטור של ארגון אחר אינם נראים', async () => {
    expect((await userA.query('select id from public.pest_findings')).rowCount).toBe(0);
    expect((await userB.query('select id from public.pest_findings')).rowCount).toBe(1);
  });

  it('לא ניתן להוסיף ממצא ליומן של ארגון אחר', async () => {
    await expect(
      userA.query(
        `insert into public.pest_findings
          (organization_id, pest_log_id, pest_name, identification_actions, development_stage,
           infestation_signs, finding_location, infestation_level)
         values ($1, $2, 'ניסיון', 'x', 'x', 'x', 'x', 'low')`,
        [SEED.orgA, orgBLogId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('לא ניתן להוסיף ממצא עם organization_id של ארגון אחר', async () => {
    await expect(
      userA.query(
        `insert into public.pest_findings
          (organization_id, pest_log_id, pest_name, identification_actions, development_stage,
           infestation_signs, finding_location, infestation_level)
         values ($1, $2, 'ניסיון', 'x', 'x', 'x', 'x', 'low')`,
        [SEED.orgB, orgALogId],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('חתימות של ארגון אחר אינן נראות', async () => {
    await admin.query(
      `insert into public.signatures
        (organization_id, pest_log_id, signer_role, signer_name, storage_path, signed_at, confirmed)
       values ($1, $2, 'exterminator', 'מדביר ב׳', 'b/x.png', now(), true)`,
      [SEED.orgB, orgBLogId],
    );
    expect((await userA.query('select id from public.signatures')).rowCount).toBe(0);
  });

  it('קבצים מצורפים של ארגון אחר אינם נראים', async () => {
    await admin.query(
      `insert into public.attachments
        (organization_id, pest_log_id, kind, storage_path, mime_type, size_bytes)
       values ($1, $2, 'pdf', 'b/secret.pdf', 'application/pdf', 100)`,
      [SEED.orgB, orgBLogId],
    );
    expect((await userA.query('select id, storage_path from public.attachments')).rowCount).toBe(0);
  });
});

describe('פרופילים והרשאות', () => {
  it('משתמש רואה את עצמו ואת חברי הארגון שלו בלבד', async () => {
    const seenByA = await userA.query('select user_id, organization_id from public.profiles');
    expect(seenByA.rows.every((row) => row.organization_id === SEED.orgA)).toBe(true);
    expect(seenByA.rows.some((row) => row.user_id === SEED.userBOwner)).toBe(false);
  });

  it('משתמש אינו יכול להעביר את עצמו לארגון אחר', async () => {
    await expect(
      userA.query('update public.profiles set organization_id = $1 where user_id = $2', [
        SEED.orgB,
        SEED.userAExterminator,
      ]),
    ).rejects.toMatchObject({ code: '42501' });

    const after = await admin.query('select organization_id from public.profiles where user_id = $1', [
      SEED.userAExterminator,
    ]);
    expect(after.rows[0].organization_id).toBe(SEED.orgA);
  });

  it('משתמש שאינו מנהל אינו יכול להעלות את דרגתו', async () => {
    await expect(
      userA.query(`update public.profiles set role = 'owner' where user_id = $1`, [SEED.userAExterminator]),
    ).rejects.toMatchObject({ code: '42501' });

    const after = await admin.query('select role from public.profiles where user_id = $1', [SEED.userAExterminator]);
    expect(after.rows[0].role).toBe('exterminator');
  });

  it('גם מנהל אינו יכול לשנות את התפקיד של עצמו', async () => {
    await expect(
      managerA.query(`update public.profiles set role = 'viewer' where user_id = $1`, [SEED.userAManager]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('מנהל יכול לשנות תפקיד של משתמש אחר בארגון שלו', async () => {
    const result = await managerA.query(`update public.profiles set role = 'viewer' where user_id = $1`, [
      SEED.userAExterminator,
    ]);
    expect(result.rowCount).toBe(1);
    // החזרה למצב ההתחלתי, כדי שלא להשפיע על בדיקות אחרות.
    await admin.query(`update public.profiles set role = 'exterminator' where user_id = $1`, [
      SEED.userAExterminator,
    ]);
  });

  it('משתמש אינו יכול להוסיף פרופיל לארגון אחר', async () => {
    await expect(
      managerA.query(
        `insert into public.profiles (organization_id, user_id, full_name) values ($1, gen_random_uuid(), 'ניסיון')`,
        [SEED.orgB],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('מדביר שאינו מנהל אינו יכול להוסיף משתמשים', async () => {
    await expect(
      userA.query(
        `insert into public.profiles (organization_id, user_id, full_name) values ($1, gen_random_uuid(), 'ניסיון')`,
        [SEED.orgA],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('ארגון: כל משתמש רואה רק את הארגון שלו', async () => {
    const seenByA = await userA.query('select id from public.organizations');
    expect(seenByA.rowCount).toBe(1);
    expect(seenByA.rows[0].id).toBe(SEED.orgA);
  });

  it('מדביר שאינו מנהל אינו יכול לעדכן את הארגון', async () => {
    const result = await userA.query(`update public.organizations set name = 'שונה' where id = $1`, [SEED.orgA]);
    expect(result.rowCount).toBe(0);
  });

  it('מנהל יכול לעדכן את הארגון שלו בלבד', async () => {
    const own = await managerA.query(`update public.organizations set phone = '040000099' where id = $1`, [SEED.orgA]);
    expect(own.rowCount).toBe(1);

    const other = await managerA.query(`update public.organizations set phone = '040000099' where id = $1`, [SEED.orgB]);
    expect(other.rowCount).toBe(0);
  });
});

describe('יומן ביקורת', () => {
  it('audit נראה למנהל בלבד, ורק של הארגון שלו', async () => {
    await admin.query(
      `insert into public.audit_events (organization_id, action, entity_type, entity_id)
       values ($1, 'test.a', 'pest_log', $2), ($3, 'test.b', 'pest_log', $4)`,
      [SEED.orgA, orgALogId, SEED.orgB, orgBLogId],
    );

    // מדביר רגיל אינו רואה audit.
    expect((await userA.query('select id from public.audit_events')).rowCount).toBe(0);

    const seenByManager = await managerA.query('select action, organization_id from public.audit_events');
    expect(seenByManager.rowCount).toBe(1);
    expect(seenByManager.rows[0].action).toBe('test.a');
  });

  it('הלקוח אינו יכול לכתוב ל-audit', async () => {
    await expect(
      managerA.query(
        `insert into public.audit_events (organization_id, action, entity_type) values ($1, 'forged', 'pest_log')`,
        [SEED.orgA],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('תור הסנכרון', () => {
  it('פעולות סנכרון מופרדות בין ארגונים', async () => {
    await userA.query(
      `insert into public.sync_operations (organization_id, idempotency_key, operation_type, entity_type)
       values ($1, 'key-a', 'upsert_draft', 'pest_log')`,
      [SEED.orgA],
    );
    expect((await userB.query('select id from public.sync_operations')).rowCount).toBe(0);
    expect((await userA.query('select id from public.sync_operations')).rowCount).toBe(1);
  });

  it('ה-RPC לרישום פעולת סנכרון חוסם ארגון אחר', async () => {
    await expect(
      userA.query(`select * from public.record_sync_operation($1, $2, 'upsert_draft', 'pest_log', null, '{}'::jsonb)`, [
        SEED.orgB,
        'key-cross-org',
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('אותו idempotency key אינו יוצר שתי פעולות', async () => {
    const first = await userA.query(
      `select * from public.record_sync_operation($1, $2, 'upsert_draft', 'pest_log', null, '{}'::jsonb)`,
      [SEED.orgA, 'key-idem-1'],
    );
    const second = await userA.query(
      `select * from public.record_sync_operation($1, $2, 'upsert_draft', 'pest_log', null, '{}'::jsonb)`,
      [SEED.orgA, 'key-idem-1'],
    );
    expect(second.rows[0].id).toBe(first.rows[0].id);
    expect(Number(second.rows[0].attempts)).toBe(1);
  });
});

describe('RLS מופעל על כל הטבלאות', () => {
  it('לכל טבלה ציבורית מופעל RLS עם FORCE', async () => {
    const result = await admin.query(`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by relname
    `);
    expect(result.rowCount).toBeGreaterThanOrEqual(18);
    const without = result.rows.filter((row) => !row.relrowsecurity || !row.relforcerowsecurity);
    expect(without.map((row) => row.relname)).toEqual([]);
  });

  it('לתפקיד anon אין גישה לנתונים', async () => {
    const result = await admin.query(`
      select count(*)::int as n
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
    `);
    expect(result.rows[0].n).toBe(0);
  });
});
