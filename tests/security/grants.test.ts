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

/**
 * RLS policies must evaluate the whole-session checks once per statement.
 *
 * This is a performance property enforced in the security suite on purpose,
 * because it is a property OF the policies and it degrades silently. The
 * admin control tower took 7.2 seconds against a 10,000-provider network:
 * `is_admin()` is SECURITY DEFINER, so the planner will not inline it, and
 * it ran once for each of 143,118 rows — its own SELECT against `profiles`
 * every time. Nothing failed. The page was simply slow, and got slower in
 * proportion to the data, which is the kind of regression nobody attributes
 * to a policy.
 *
 * Migration 0037 wrapped every uncorrelated call in a scalar subquery so the
 * planner hoists it to an InitPlan. The check below is on the SHAPE of the
 * expression rather than on a timing, because a timing assertion on a small
 * test database proves nothing and fails on a loaded CI box.
 */
describe('RLS policies do not re-check the session per row', () => {
  /** How PostgreSQL re-prints a hoisted call. Anything else is unhoisted. */
  const HOISTED = '( SELECT is_admin() AS is_admin)';

  it('never evaluates is_admin() per row', async () => {
    const { rows } = await adminPool().query<{ table_name: string; policy: string }>(
      `select polrelid::regclass::text as table_name, polname as policy
         from pg_policy
        where replace(coalesce(pg_get_expr(polqual, polrelid), ''), $1, '') like '%is_admin()%'
           or replace(coalesce(pg_get_expr(polwithcheck, polrelid), ''), $1, '') like '%is_admin()%'
        order by 1, 2`,
      [HOISTED],
    );

    expect(
      rows.map((r) => `${r.table_name}.${r.policy}`),
      'these policies call is_admin() once per row — wrap it as (select is_admin())',
    ).toEqual([]);
  });

  it('still evaluates the row-correlated helpers per row', async () => {
    /*
     * The other half of the invariant, and the more important one. A helper
     * that reads the row must NOT be hoisted: freezing the first row's answer
     * and applying it to every other row would turn a per-row permission
     * check into a blanket grant. This asserts the rewrite did not overreach.
     */
    const { rows } = await adminPool().query<{ n: string }>(
      `select count(*) as n
         from pg_policy
        where coalesce(pg_get_expr(polqual, polrelid), '') ~
              '\\( SELECT (is_job_participant|provider_assigned_to_job|job_customer_id|provider_has_interest_in_job|customer_may_track_provider|can_review|shares_active_job_with)\\('`,
    );

    expect(Number(rows[0]?.n ?? -1)).toBe(0);
  });
});
