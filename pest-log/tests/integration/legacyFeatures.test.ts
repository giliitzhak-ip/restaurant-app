import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminClient, SEED, userClient } from '../setup/pgClient';

/**
 * הטבלאות שנוספו עם הפונקציות מהגרסה הקודמת: ספריות ניסוח ומאגר תחנות
 * לאתר. נבדק מול Postgres אמיתי, כולל בידוד בין ארגונים.
 */

const SITE_VAAD = '00000000-0000-4000-d000-000000000001';

let admin: pg.Client;
let userA: pg.Client;
let userB: pg.Client;

beforeAll(async () => {
  admin = await adminClient();
  userA = await userClient(SEED.userAExterminator);
  userB = await userClient(SEED.userBOwner);
});

afterAll(async () => {
  await Promise.allSettled([admin?.end(), userA?.end(), userB?.end()]);
});

beforeEach(async () => {
  await admin.query('truncate public.text_templates, public.site_stations cascade');
});

describe('ספריות ניסוח', () => {
  it('מדביר שומר ניסוח, רואה אותו, ומוחק אותו', async () => {
    const inserted = await userA.query(
      `insert into public.text_templates (organization_id, kind, body, source)
       values ($1, 'warnings', 'יש לאוורר שעתיים לפני כניסה לחדר', 'saved') returning id`,
      [SEED.orgA],
    );
    expect(inserted.rowCount).toBe(1);

    const seen = await userA.query('select body from public.text_templates');
    expect(seen.rows[0].body).toContain('לאוורר');

    const deleted = await userA.query('delete from public.text_templates where id = $1', [
      inserted.rows[0].id,
    ]);
    expect(deleted.rowCount).toBe(1);
  });

  it('אותו ניסוח פעמיים באותו סוג נדחה', async () => {
    await userA.query(
      `insert into public.text_templates (organization_id, kind, body) values ($1, 'prevention', 'איטום סדקים בקיר המטבח')`,
      [SEED.orgA],
    );
    await expect(
      userA.query(
        `insert into public.text_templates (organization_id, kind, body) values ($1, 'prevention', 'איטום סדקים בקיר המטבח')`,
        [SEED.orgA],
      ),
    ).rejects.toThrow();

    // אותו טקסט בסוג אחר — מותר.
    const other = await userA.query(
      `insert into public.text_templates (organization_id, kind, body) values ($1, 'warnings', 'איטום סדקים בקיר המטבח') returning id`,
      [SEED.orgA],
    );
    expect(other.rowCount).toBe(1);
  });

  it('ניסוח קצר מדי נדחה', async () => {
    await expect(
      userA.query(
        `insert into public.text_templates (organization_id, kind, body) values ($1, 'warnings', 'אב')`,
        [SEED.orgA],
      ),
    ).rejects.toThrow();
  });

  it('ארגון אחד אינו רואה את הניסוחים של השני', async () => {
    await admin.query(
      `insert into public.text_templates (organization_id, kind, body) values ($1, 'warnings', 'ניסוח של ארגון א')`,
      [SEED.orgA],
    );
    await admin.query(
      `insert into public.text_templates (organization_id, kind, body) values ($1, 'warnings', 'ניסוח של ארגון ב')`,
      [SEED.orgB],
    );

    const seenByA = await userA.query('select body from public.text_templates');
    expect(seenByA.rowCount).toBe(1);
    expect(seenByA.rows[0].body).toContain('ארגון א');

    const seenByB = await userB.query('select body from public.text_templates');
    expect(seenByB.rowCount).toBe(1);
    expect(seenByB.rows[0].body).toContain('ארגון ב');
  });
});

describe('מאגר תחנות לאתר', () => {
  it('תחנות נשמרות לאתר ומקבלות מספור עוקב', async () => {
    for (let number = 1; number <= 3; number += 1) {
      await userA.query(
        `insert into public.site_stations (organization_id, client_site_id, station_number, station_type, location_description)
         values ($1, $2, $3, 'bait_poison', $4)`,
        [SEED.orgA, SITE_VAAD, number, `מחסן ${number}`],
      );
    }
    const rows = await userA.query(
      'select station_number from public.site_stations where client_site_id = $1 order by station_number',
      [SITE_VAAD],
    );
    expect(rows.rows.map((row) => row.station_number)).toEqual([1, 2, 3]);
  });

  it('תחנה מחייבת אתר או מפתח אתר', async () => {
    await expect(
      userA.query(
        `insert into public.site_stations (organization_id, station_number, station_type) values ($1, 1, 'glue_trap')`,
        [SEED.orgA],
      ),
    ).rejects.toThrow();

    const withKey = await userA.query(
      `insert into public.site_stations (organization_id, site_key, station_number, station_type)
       values ($1, 'לקוח בדיקה|רחוב הבדיקה 1', 1, 'glue_trap') returning id`,
      [SEED.orgA],
    );
    expect(withKey.rowCount).toBe(1);
  });

  it('סוג תחנה לא מוכר נדחה', async () => {
    await expect(
      userA.query(
        `insert into public.site_stations (organization_id, client_site_id, station_number, station_type)
         values ($1, $2, 1, 'laser_trap')`,
        [SEED.orgA, SITE_VAAD],
      ),
    ).rejects.toThrow();
  });

  it('הסרת תחנה היא סימון כלא פעילה — ההיסטוריה נשמרת', async () => {
    const inserted = await userA.query(
      `insert into public.site_stations (organization_id, client_site_id, station_number, station_type)
       values ($1, $2, 7, 'bait_monitor') returning id`,
      [SEED.orgA, SITE_VAAD],
    );
    await userA.query('update public.site_stations set is_active = false where id = $1', [
      inserted.rows[0].id,
    ]);

    const active = await userA.query(
      'select id from public.site_stations where client_site_id = $1 and is_active = true',
      [SITE_VAAD],
    );
    expect(active.rowCount).toBe(0);

    const all = await userA.query('select station_number from public.site_stations where id = $1', [
      inserted.rows[0].id,
    ]);
    expect(all.rows[0].station_number).toBe(7);
  });

  it('ארגון אחר אינו רואה את התחנות', async () => {
    await admin.query(
      `insert into public.site_stations (organization_id, client_site_id, station_number, station_type)
       values ($1, $2, 1, 'bait_poison')`,
      [SEED.orgA, SITE_VAAD],
    );
    const seenByB = await userB.query('select id from public.site_stations');
    expect(seenByB.rowCount).toBe(0);
  });
});

describe('עמודות שנוספו ליומן', () => {
  it('pest_findings.pest_subtype, bait_stations.station_type ו-attachments.photo_kind קיימות', async () => {
    const columns = await admin.query(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (
            ('pest_findings', 'pest_subtype'),
            ('bait_stations', 'station_type'),
            ('bait_stations', 'site_station_id'),
            ('attachments', 'photo_kind')
          )`,
    );
    expect(columns.rowCount).toBe(4);
  });

  it('photo_kind מוגבל לערכים המוכרים', async () => {
    const log = await admin.query(
      `insert into public.pest_logs (organization_id, content) values ($1, '{}'::jsonb) returning id`,
      [SEED.orgA],
    );
    await expect(
      admin.query(
        `insert into public.attachments (organization_id, pest_log_id, kind, storage_path, mime_type, size_bytes, photo_kind)
         values ($1, $2, 'photo', 'org/x.jpg', 'image/jpeg', 1000, 'unknown_kind')`,
        [SEED.orgA, log.rows[0].id],
      ),
    ).rejects.toThrow();

    const ok = await admin.query(
      `insert into public.attachments (organization_id, pest_log_id, kind, storage_path, mime_type, size_bytes, photo_kind)
       values ($1, $2, 'photo', 'org/y.jpg', 'image/jpeg', 1000, 'hazard') returning id`,
      [SEED.orgA, log.rows[0].id],
    );
    expect(ok.rowCount).toBe(1);
    // יומן אינו נמחק מהמסד (הגנת השמירה), ולכן מנקים רק את הקובץ המצורף.
    await admin.query('delete from public.attachments where pest_log_id = $1', [log.rows[0].id]);
  });
});
