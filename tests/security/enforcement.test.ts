import { afterAll, describe, expect, it } from 'vitest';
import { getPool, withAnon, withSystem, withUser } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createCustomer,
  createJob,
} from '../helpers/fixtures';

/**
 * Meta-tests: prove the security harness is CAPABLE OF FAILING.
 *
 * Every "must see 0 rows" assertion in rls.test.ts would also pass if the
 * harness were simply broken — if auth.uid() came back NULL, or if the
 * connection had no privileges, everything would return nothing and the
 * suite would look perfectly green while testing nothing.
 *
 * (That is not hypothetical: an early version of this harness set the JWT
 * claim outside a transaction, so it was discarded by autocommit and every
 * negative test passed vacuously.)
 *
 * These tests pin down the preconditions that make the other file meaningful.
 */
describe('security harness self-check', () => {
  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('runs as the authenticated role, not as a superuser or the table owner', async () => {
    const info = await withUser('00000000-0000-0000-0000-000000000000', (db) =>
      db.one<{
        current_user: string;
        is_superuser: boolean;
        bypassrls: boolean;
      }>(
        `select current_user::text as current_user,
                (select rolsuper from pg_roles where rolname = current_user) as is_superuser,
                (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls`,
      ),
    );

    expect(info?.current_user).toBe('authenticated');
    expect(info?.is_superuser).toBe(false);
    expect(info?.bypassrls).toBe(false);
  });

  it('resolves auth.uid() to the requested user inside the transaction', async () => {
    const customer = await createCustomer();
    const resolved = await withUser(customer.id, (db) =>
      db.one<{ uid: string | null }>('select auth.uid()::text as uid'),
    );
    // If this were NULL, every negative RLS test would pass for free.
    expect(resolved?.uid).toBe(customer.id);
  });

  it('POSITIVE CONTROL: a user really can see their own rows', async () => {
    const customer = await createCustomer();
    const jobId = await createJob({ customerId: customer.id });

    const rows = await withUser(customer.id, (db) =>
      db.many('select id from jobs where id = $1', [jobId]),
    );
    // Non-empty proves the connection has privileges and the row exists, so
    // an empty result elsewhere means RLS refused — not that nothing works.
    expect(rows).toHaveLength(1);
  });

  it('the row exists for the owner even when a user cannot see it', async () => {
    const alice = await createCustomer('אליס');
    const bob = await createCustomer('בוב');
    const jobId = await createJob({ customerId: alice.id });

    const { rows } = await adminPool().query('select id from jobs where id = $1', [jobId]);
    expect(rows).toHaveLength(1);

    const asBob = await withUser(bob.id, (db) =>
      db.many('select id from jobs where id = $1', [jobId]),
    );
    expect(asBob).toHaveLength(0);
  });

  it('does not leak the JWT claim to the next user of a pooled connection', async () => {
    const alice = await createCustomer('אליס');
    const jobId = await createJob({ customerId: alice.id });

    // Run as Alice, then immediately as an anonymous caller. Because the
    // claim is set with set_local, it dies with the transaction.
    await withUser(alice.id, (db) => db.many('select id from jobs where id = $1', [jobId]));

    const anonSees = await withAnon((db) =>
      db.many('select id from jobs where id = $1', [jobId]).catch(() => []),
    );
    expect(anonSees).toHaveLength(0);

    for (let i = 0; i < 5; i += 1) {
      const uid = await withAnon((db) =>
        db.one<{ uid: string | null }>('select auth.uid()::text as uid'),
      );
      expect(uid?.uid).toBeNull();
    }
  });

  it('the system role can bypass RLS — and is reachable only from server code', async () => {
    const alice = await createCustomer('אליס');
    const jobId = await createJob({ customerId: alice.id });

    const info = await withSystem((db) =>
      db.one<{ current_user: string; bypassrls: boolean }>(
        `select current_user::text as current_user,
                (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls`,
      ),
    );
    expect(info?.current_user).toBe('service_role');
    expect(info?.bypassrls).toBe(true);

    // It sees everything, which is why nothing user-facing may use it.
    const rows = await withSystem((db) =>
      db.many('select id from jobs where id = $1', [jobId]),
    );
    expect(rows).toHaveLength(1);
  });

  it('has RLS enabled on every user-exposed table', async () => {
    const rows = await withSystem((db) =>
      db.many<{ tablename: string }>(
        `select tablename from pg_tables
          where schemaname = 'public'
            and not rowsecurity
            and tablename not in ('schema_migrations','spatial_ref_sys')`,
      ),
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('has at least one policy on every table with RLS enabled', async () => {
    const rows = await withSystem((db) =>
      db.many<{ tablename: string }>(
        `select t.tablename
           from pg_tables t
          where t.schemaname = 'public'
            and t.rowsecurity
            and not exists (
              select 1 from pg_policies p
               where p.schemaname = 'public' and p.tablename = t.tablename
            )`,
      ),
    );
    // A table with RLS on and no policy denies everyone, which is safe but
    // almost always an oversight worth surfacing.
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});
