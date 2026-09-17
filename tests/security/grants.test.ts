import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, withUser } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createCustomer,
  type TestCustomer,
} from '../helpers/fixtures';

/**
 * Role grants are part of the security model, so they are asserted, not
 * assumed.
 *
 * This exists because migration 0017 added two tables and granted them to
 * `authenticated` only. Every provider action on their own hours worked; every
 * system read of them returned 42501, which the API layer faithfully reports
 * as 403 FORBIDDEN. The result was a permission error on a screen where
 * permission was never the question, and no test noticed.
 *
 * The invariants below are deliberately about the SHAPE of the grants rather
 * than a list of tables, so a new table is covered the day it is added.
 */
describe('role grants', () => {
  let customer: TestCustomer;

  beforeAll(async () => {
    await cleanupTestData();
    customer = await createCustomer();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('lets service_role read every application table', async () => {
    // service_role IS the system. A table it cannot read is a table whose
    // system code path is broken, whatever the tests of that table say.
    const { rows } = await adminPool().query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname <> 'schema_migrations'
          and not has_table_privilege('service_role', c.oid, 'select')
        order by 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('keeps every table granted to authenticated behind RLS', async () => {
    // A grant to `authenticated` is only safe because RLS narrows it. A table
    // granted to authenticated with RLS off would be readable and writable by
    // every signed-in user, whatever its policies claim.
    const { rows } = await adminPool().query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          -- PostGIS's own reference table, world-readable by design and not
          -- ours to police.
          and c.relname <> 'spatial_ref_sys'
          and has_table_privilege('authenticated', c.oid, 'select')
          and not c.relrowsecurity
        order by 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('gives the anonymous role read access to the catalog and nothing else', async () => {
    const { rows } = await adminPool().query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname <> 'spatial_ref_sys'
          and has_table_privilege('anon', c.oid, 'select')
        order by 1`,
    );
    // The catalog a visitor browses and the state machine the client renders.
    // Neither holds anyone's data.
    expect(rows.map((r) => r.relname)).toEqual(['categories', 'job_transitions', 'services']);
  });

  it('never lets the anonymous role write anything', async () => {
    const { rows } = await adminPool().query<{ relname: string; privilege: string }>(
      `select c.relname, p.privilege
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         cross join (values ('insert'), ('update'), ('delete')) as p(privilege)
        where n.nspname = 'public'
          and c.relkind = 'r'
          and has_table_privilege('anon', c.oid, p.privilege)
        order by 1, 2`,
    );
    expect(rows).toEqual([]);
  });

  /**
   * `authenticated` holds write privileges on the configuration tables
   * because an ADMIN is an ordinary authenticated user with is_admin() true —
   * so RLS, not the grant, is what separates them. That makes the grant
   * correct and the policy load-bearing, which is worth asserting
   * behaviourally rather than by reading the ACL.
   */
  it('stops a signed-in non-admin from writing configuration or the catalog', async () => {
    const attempts: { table: string; sql: string; params: unknown[] }[] = [
      {
        table: 'settings',
        sql: `update settings set value = '"tampered"'::jsonb where key = 'matching.weights'`,
        params: [],
      },
      {
        table: 'categories',
        sql: `update categories set name_he = 'tampered' where slug = 'plumbing'`,
        params: [],
      },
      {
        table: 'services',
        sql: `update services set base_price_ils = 1 where slug = 'sink_leak'`,
        params: [],
      },
    ];

    // Without this the test could pass vacuously on an empty database: zero
    // rows updated means nothing if there was no row to update.
    const { rows: targets } = await adminPool().query<{ present: string }>(
      `select (
         (select count(*) from settings where key = 'matching.weights') +
         (select count(*) from categories where slug = 'plumbing') +
         (select count(*) from services where slug = 'sink_leak')
       )::text as present`,
    );
    expect(targets[0]?.present).toBe('3');

    for (const attempt of attempts) {
      const affected = await withUser(customer.id, async (db) => {
        const result = await db.query(attempt.sql, attempt.params as never[]);
        return result.rowCount ?? 0;
      });
      expect(affected, `${attempt.table} must be unwritable by a customer`).toBe(0);
    }

    // And the values really are untouched — a silent 0 rows could also mean
    // the target row was simply absent.
    const { rows } = await adminPool().query<{ tampered: string }>(
      `select count(*)::text as tampered
         from settings where value = '"tampered"'::jsonb`,
    );
    expect(rows[0]?.tampered).toBe('0');
  });
});
