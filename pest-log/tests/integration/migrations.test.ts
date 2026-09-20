import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminClient, connectionString } from '../setup/pgClient';
import { runMigrations } from '../../scripts/migrate.mjs';
import { runSeed } from '../../scripts/seed.mjs';

/**
 * בדיקות ה-migrations וה-seed.
 *
 * ה-globalSetup מפיל את הסכמות ומריץ את ה-migrations וה-seed מאפס בכל
 * הרצה, ולכן כל הרצת בדיקות היא גם בדיקה של סביבה נקייה. כאן נבדק מה
 * שנוצר בפועל, ושהרצה חוזרת אינה משנה דבר.
 */

let admin: pg.Client;

beforeAll(async () => {
  admin = await adminClient();
});

afterAll(async () => {
  await admin?.end();
});

const EXPECTED_TABLES = [
  'assistant_exterminators',
  'attachments',
  'audit_events',
  'bait_stations',
  'client_sites',
  'clients',
  'maintenance_routes',
  'organizations',
  'pest_catalog',
  'pest_findings',
  'pest_logs',
  'pesticide_applications',
  'pesticide_licenses',
  'prevention_actions',
  'products',
  'profiles',
  'route_assignments',
  'route_templates',
  'route_visits',
  'signatures',
  'site_stations',
  'sync_operations',
  'text_templates',
  'visit_focus_items',
  'visit_status_history',
  'warning_templates',
];

describe('migrations בסביבה נקייה', () => {
  it('נוצרו כל הטבלאות', async () => {
    const result = await admin.query(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `);
    expect(result.rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
  });

  it('לכל טבלה יש organization_id, created_at, updated_at, created_by, updated_by', async () => {
    for (const table of EXPECTED_TABLES) {
      const result = await admin.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = $1`,
        [table],
      );
      const columns = new Set(result.rows.map((row) => row.column_name));
      for (const required of ['id', 'organization_id', 'created_at', 'updated_at', 'created_by', 'updated_by']) {
        expect(columns.has(required), `${table} חסרה עמודה ${required}`).toBe(true);
      }
    }
  });

  it('מזהי הרשומות הם UUID', async () => {
    const result = await admin.query(`
      select table_name, data_type from information_schema.columns
      where table_schema = 'public' and column_name = 'id'
      order by table_name
    `);
    for (const row of result.rows) {
      expect(row.data_type, `${row.table_name}.id`).toBe('uuid');
    }
  });

  it('כל ה-migrations נרשמו', async () => {
    const result = await admin.query('select filename from app.schema_migrations order by filename');
    const files = result.rows.map((row) => row.filename);
    expect(files).toContain('0001_foundation.sql');
    expect(files).toContain('0006_rls.sql');
    expect(files).toContain('0008_profile_guards.sql');
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('הרצה חוזרת של ה-migrations אינה משנה דבר (idempotent)', async () => {
    const before = await admin.query('select count(*)::int as n from app.schema_migrations');
    await runMigrations({ connectionString: connectionString(), local: true, quiet: true });
    const after = await admin.query('select count(*)::int as n from app.schema_migrations');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('הטריגרים הקריטיים קיימים', async () => {
    const result = await admin.query(`
      select tgname from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where c.relname = 'pest_logs' and not t.tgisinternal
      order by tgname
    `);
    const triggers = result.rows.map((row) => row.tgname);
    expect(triggers).toContain('trg_pest_logs_immutable');
    expect(triggers).toContain('trg_pest_logs_no_delete');
    expect(triggers).toContain('trg_pest_logs_touch');
    expect(triggers).toContain('trg_pest_logs_version');
  });

  it('אילוץ ייחודיות למספר סידורי ברמת הארגון', async () => {
    const result = await admin.query(`
      select conname from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'pest_logs' and c.contype = 'u'
    `);
    expect(result.rows.map((row) => row.conname)).toContain('pest_logs_serial_unique_per_org');
  });

  it('תקופת השמירה אינה יכולה לרדת מתחת לשלוש שנים', async () => {
    await expect(
      admin.query('update public.organizations set retention_years = 1 where true'),
    ).rejects.toThrow();
  });

  it('יומן שהושלם חייב מספר סידורי, snapshot, hash וזמן השלמה', async () => {
    const constraints = await admin.query(`
      select conname from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'pest_logs' and c.contype = 'c'
    `);
    const names = constraints.rows.map((row) => row.conname);
    expect(names).toContain('pest_logs_completed_shape');
    expect(names).toContain('pest_logs_draft_shape');
    expect(names).toContain('pest_logs_cancelled_shape');
    expect(names).toContain('pest_logs_correction_shape');
  });
});

describe('seed בסביבה נקייה', () => {
  it('נטענו שני ארגונים, כדי שאפשר לבדוק בידוד', async () => {
    const result = await admin.query('select count(*)::int as n from public.organizations');
    expect(result.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('נתוני התכשירים והמזיקים מסומנים כנתוני דוגמה ולא כמקור רשמי', async () => {
    const products = await admin.query('select source_name, verified_at from public.products');
    expect(products.rowCount).toBeGreaterThan(0);
    for (const row of products.rows) {
      // אסור שנתוני דוגמה יוצגו כמקור רשמי.
      expect(row.source_name).toMatch(/דוגמה/);
      expect(row.verified_at).toBeTruthy();
    }

    const pests = await admin.query('select source_name from public.pest_catalog');
    for (const row of pests.rows) {
      expect(row.source_name).toMatch(/דוגמה/);
      expect(row.source_name).toMatch(/אינו נספח א׳/);
    }
  });

  it('הרצה חוזרת של ה-seed אינה יוצרת כפילויות', async () => {
    const before = await admin.query('select count(*)::int as n from public.clients');
    await runSeed({ connectionString: connectionString(), quiet: true });
    const after = await admin.query('select count(*)::int as n from public.clients');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('אין בנתוני הדוגמה כתובות דוא״ל שאינן example.test', async () => {
    const result = await admin.query(`
      select email from public.profiles where email is not null
      union all select email from public.clients where email is not null
      union all select email from public.organizations where email is not null
    `);
    for (const row of result.rows) {
      expect(row.email).toMatch(/@example\.(test|com)$/);
    }
  });
});
