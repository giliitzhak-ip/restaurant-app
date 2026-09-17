import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, withUser } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createAdmin,
  createBareProvider,
  createCustomer,
} from '../helpers/fixtures';

/**
 * Admin audit integrity (spec §33: every admin action must be audited).
 *
 * These exist because of a real failure. admin_actions originally had a
 * SELECT-only policy, and the audit INSERT ran in its own transaction — so
 * verify_provider committed the change, was denied the audit row, and
 * returned an error. The provider was verified, no trail existed, and the
 * caller was told it had failed.
 */
describe('admin audit trail', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('an admin can write their own audit row', async () => {
    const admin = await createAdmin();
    const provider = await createBareProvider();

    await withUser(admin.id, (db) =>
      db.query(
        `insert into admin_actions
           (admin_id, action, target_type, target_id, before_state, after_state)
         values ($1,'verify_provider','provider',$2,'{"verification":"PENDING"}'::jsonb,
                 '{"verification":"VERIFIED"}'::jsonb)`,
        [admin.id, provider.id],
      ),
    );

    const { rows } = await adminPool().query(
      'select action, target_id from admin_actions where admin_id = $1',
      [admin.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('verify_provider');
  });

  it('an admin cannot forge an action in another admin’s name', async () => {
    const one = await createAdmin();
    const two = await createAdmin();

    await expect(
      withUser(one.id, (db) =>
        db.query(
          `insert into admin_actions (admin_id, action, target_type)
           values ($1,'cancel_job','job')`,
          [two.id],
        ),
      ),
    ).rejects.toThrow();

    const { rows } = await adminPool().query(
      'select count(*)::int as n from admin_actions where admin_id = $1',
      [two.id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('a non-admin cannot write to the audit log at all', async () => {
    const customer = await createCustomer();
    await expect(
      withUser(customer.id, (db) =>
        db.query(
          `insert into admin_actions (admin_id, action, target_type)
           values ($1,'verify_provider','provider')`,
          [customer.id],
        ),
      ),
    ).rejects.toThrow();
  });

  it('the audit log is append-only: no update, no delete', async () => {
    const admin = await createAdmin();
    await withUser(admin.id, (db) =>
      db.query(
        `insert into admin_actions (admin_id, action, target_type, reason)
         values ($1,'cancel_job','job','original reason')`,
        [admin.id],
      ),
    );

    // No UPDATE or DELETE policy exists, and none should.
    await expect(
      withUser(admin.id, (db) =>
        db.query(`update admin_actions set reason = 'rewritten' where admin_id = $1`, [admin.id]),
      ),
    ).rejects.toThrow();

    await expect(
      withUser(admin.id, (db) =>
        db.query('delete from admin_actions where admin_id = $1', [admin.id]),
      ),
    ).rejects.toThrow();

    const { rows } = await adminPool().query(
      'select reason from admin_actions where admin_id = $1',
      [admin.id],
    );
    expect(rows[0].reason).toBe('original reason');
  });

  it('a change and its audit row commit together, or neither does', async () => {
    const admin = await createAdmin();
    const provider = await createBareProvider({ verification: 'PENDING' });

    // Mirror the handler: mutate and audit in ONE transaction, then fail it.
    await expect(
      withUser(admin.id, async (db) => {
        await db.query(
          `update provider_profiles set verification = 'VERIFIED' where id = $1`,
          [provider.id],
        );
        await db.query(
          `insert into admin_actions (admin_id, action, target_type, target_id)
           values ($1,'verify_provider','provider',$2)`,
          [admin.id, provider.id],
        );
        throw new Error('simulated failure after both writes');
      }),
    ).rejects.toThrow(/simulated failure/);

    // Neither survived: the provider is still PENDING and no row was logged.
    const { rows: prov } = await adminPool().query(
      'select verification::text as verification from provider_profiles where id = $1',
      [provider.id],
    );
    expect(prov[0].verification).toBe('PENDING');

    const { rows: audit } = await adminPool().query(
      'select count(*)::int as n from admin_actions where target_id = $1',
      [provider.id],
    );
    expect(audit[0].n).toBe(0);
  });
});
