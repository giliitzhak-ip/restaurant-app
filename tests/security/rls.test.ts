import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, withUser } from '@/lib/db';
import {
  adminPool,
  advanceJobTo,
  cleanupTestData,
  closeAdminPool,
  createAdmin,
  createCustomer,
  createJob,
  createProvider,
} from '../helpers/fixtures';

const LOC = { lat: 32.0742, lon: 34.7749 };

/**
 * Security tests (spec §49).
 *
 * These run through the ordinary application path: the restricted app login,
 * SET ROLE authenticated, request.jwt.claims set — exactly as a real request
 * does. So a pass here means the DATABASE refused, not that some TypeScript
 * check happened to run.
 *
 * tests/security/enforcement.test.ts separately proves that this harness is
 * capable of failing, so a green result here cannot be vacuous.
 */
describe('row level security', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('a customer cannot read another customer’s job', async () => {
    const alice = await createCustomer('אליס');
    const bob = await createCustomer('בוב');
    const jobId = await createJob({ customerId: alice.id, ...LOC });

    const asAlice = await withUser(alice.id, (db) =>
      db.many('select id from jobs where id = $1', [jobId]),
    );
    expect(asAlice).toHaveLength(1);

    const asBob = await withUser(bob.id, (db) =>
      db.many('select id from jobs where id = $1', [jobId]),
    );
    expect(asBob).toHaveLength(0);
  });

  it('a customer cannot read another customer’s profile', async () => {
    const alice = await createCustomer('אליס');
    const bob = await createCustomer('בוב');

    const rows = await withUser(bob.id, (db) =>
      db.many('select id from profiles where id = $1', [alice.id]),
    );
    expect(rows).toHaveLength(0);
  });

  it('a provider cannot read another provider’s payout details', async () => {
    const one = await createProvider({ name: 'מקצוען אחד' });
    const two = await createProvider({ name: 'מקצוען שני' });
    await adminPool().query(
      `insert into provider_payout_details (provider_id, method, details)
       values ($1,'bank_transfer','{"iban":"IL-SECRET"}')`,
      [one.id],
    );

    const own = await withUser(one.id, (db) =>
      db.many('select provider_id from provider_payout_details'),
    );
    expect(own).toHaveLength(1);

    const other = await withUser(two.id, (db) =>
      db.many('select provider_id from provider_payout_details where provider_id = $1', [one.id]),
    );
    expect(other).toHaveLength(0);
  });

  it('a provider cannot read another provider’s offers', async () => {
    const customer = await createCustomer();
    const mine = await createProvider({ name: 'שלי', lat: 32.0755, lon: 34.7755 });
    const theirs = await createProvider({ name: 'שלהם', lat: 32.0756, lon: 34.7756 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    const visible = await withUser(theirs.id, (db) =>
      db.many('select id, provider_id from job_offers'),
    );
    expect(visible.every((row) => row.provider_id === theirs.id)).toBe(true);
    expect(visible.some((row) => row.provider_id === mine.id)).toBe(false);
  });

  it('a provider cannot accept another provider’s offer', async () => {
    const customer = await createCustomer();
    const target = await createProvider({ name: 'היעד', lat: 32.0755, lon: 34.7755 });
    const attacker = await createProvider({ name: 'התוקף', lat: 32.0756, lon: 34.7756 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    const { rows } = await adminPool().query(
      'select id from job_offers where job_id = $1 and provider_id = $2',
      [jobId, target.id],
    );
    const victimOffer = rows[0].id;

    await expect(
      withUser(attacker.id, (db) => db.one('select accept_job_offer($1)', [victimOffer])),
    ).rejects.toThrow(/OFFER_NOT_YOURS|OFFER_NOT_FOUND/);

    const { rows: assignments } = await adminPool().query(
      'select provider_id from job_assignments where job_id = $1',
      [jobId],
    );
    expect(assignments).toHaveLength(0);
  });

  it('a customer cannot modify a provider’s earnings or a payment row', async () => {
    const customer = await createCustomer();
    const provider = await createProvider();
    const jobId = await createJob({ customerId: customer.id, ...LOC });

    await adminPool().query(
      `insert into payments (job_id, customer_id, provider_id, gross_amount,
                             platform_fee, provider_amount, provider_name, status)
       values ($1,$2,$3,29000,4350,24650,'mock','CAPTURED')`,
      [jobId, customer.id, provider.id],
    );

    // The customer may READ their own payment...
    const readable = await withUser(customer.id, (db) =>
      db.many('select id, provider_amount from payments where job_id = $1', [jobId]),
    );
    expect(readable).toHaveLength(1);

    // ...but has no UPDATE privilege on payments at all.
    await expect(
      withUser(customer.id, (db) =>
        db.query('update payments set provider_amount = 1 where job_id = $1', [jobId]),
      ),
    ).rejects.toThrow();

    const { rows } = await adminPool().query(
      'select provider_amount from payments where job_id = $1',
      [jobId],
    );
    expect(Number(rows[0].provider_amount)).toBe(24650);
  });

  it('a non-admin cannot read admin surfaces: settings, telemetry, audit log', async () => {
    const customer = await createCustomer();
    const provider = await createProvider();

    for (const table of ['settings', 'matching_events', 'admin_actions', 'payment_transactions']) {
      const asCustomer = await withUser(customer.id, (db) =>
        db.many(`select * from ${table} limit 5`),
      );
      expect(asCustomer, `${table} must be invisible to a customer`).toHaveLength(0);

      const asProvider = await withUser(provider.id, (db) =>
        db.many(`select * from ${table} limit 5`),
      );
      expect(asProvider, `${table} must be invisible to a provider`).toHaveLength(0);
    }
  });

  it('an admin can read the admin surfaces', async () => {
    const admin = await createAdmin();
    const settings = await withUser(admin.id, (db) => db.many('select key from settings'));
    expect(settings.length).toBeGreaterThan(0);
  });

  it('a user cannot escalate their own role to admin', async () => {
    const customer = await createCustomer();

    await expect(
      withUser(customer.id, (db) =>
        db.query(`update profiles set role = 'admin' where id = $1`, [customer.id]),
      ),
    ).rejects.toThrow(/ROLE_CHANGE_FORBIDDEN/);

    const { rows } = await adminPool().query('select role::text as role from profiles where id = $1', [
      customer.id,
    ]);
    expect(rows[0].role).toBe('customer');
  });

  it('a provider cannot verify themselves', async () => {
    const provider = await createProvider({ verification: 'PENDING' });

    await expect(
      withUser(provider.id, (db) =>
        db.query(`update provider_profiles set verification = 'VERIFIED' where id = $1`, [
          provider.id,
        ]),
      ),
    ).rejects.toThrow(/VERIFICATION_CHANGE_FORBIDDEN/);
  });

  it('a customer cannot see a provider’s live location before the job is in flight', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    // Offer stage only — tracking must not be available yet.
    const beforeConfirm = await withUser(customer.id, (db) =>
      db.many('select provider_id from provider_locations where provider_id = $1', [provider.id]),
    );
    expect(beforeConfirm).toHaveLength(0);
  });

  it('a customer CAN see the provider’s location once the job is in flight', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    const { rows } = await adminPool().query(
      'select id from job_offers where job_id = $1 and provider_id = $2',
      [jobId, provider.id],
    );
    await withUser(provider.id, (db) => db.one('select accept_job_offer($1)', [rows[0].id]));
    await withUser(
      customer.id,
      (db) => db.query(`update jobs set status='CONFIRMED' where id=$1`, [jobId]),
      { actorRole: 'customer' },
    );

    const visible = await withUser(customer.id, (db) =>
      db.many('select provider_id from provider_locations where provider_id = $1', [provider.id]),
    );
    expect(visible).toHaveLength(1);
  });

  it('a stranger cannot see the provider’s location at all', async () => {
    const customer = await createCustomer();
    const stranger = await createCustomer('זר');
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    const visible = await withUser(stranger.id, (db) =>
      db.many('select provider_id from provider_locations where provider_id = $1', [provider.id]),
    );
    expect(visible).toHaveLength(0);
  });

  it('a user cannot forge an audit-trail entry', async () => {
    const customer = await createCustomer();
    const jobId = await createJob({ customerId: customer.id, ...LOC });

    await expect(
      withUser(customer.id, (db) =>
        db.query(
          `insert into job_status_history (job_id, to_status, reason)
           values ($1,'COMPLETED','forged')`,
          [jobId],
        ),
      ),
    ).rejects.toThrow();
  });

  it('a customer cannot review a job that never completed (spec §30)', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    await expect(
      withUser(customer.id, (db) =>
        db.query(
          `insert into reviews (job_id, author_id, subject_id, direction, rating)
           values ($1,$2,$3,'customer_to_provider',5)`,
          [jobId, customer.id, provider.id],
        ),
      ),
    ).rejects.toThrow();
  });

  it('a stranger cannot review someone else’s completed job', async () => {
    const customer = await createCustomer();
    const stranger = await createCustomer('זר');
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    const { rows } = await adminPool().query(
      'select id from job_offers where job_id = $1 and provider_id = $2',
      [jobId, provider.id],
    );
    await withUser(provider.id, (db) => db.one('select accept_job_offer($1)', [rows[0].id]));
    // Walked through legal transitions: the trigger refuses a direct jump
    // even for the table owner.
    await advanceJobTo(jobId, 'COMPLETED');

    await expect(
      withUser(stranger.id, (db) =>
        db.query(
          `insert into reviews (job_id, author_id, subject_id, direction, rating)
           values ($1,$2,$3,'customer_to_provider',1)`,
          [jobId, stranger.id, provider.id],
        ),
      ),
    ).rejects.toThrow();
  });

  it('a customer cannot create a job in someone else’s name', async () => {
    const alice = await createCustomer('אליס');
    const bob = await createCustomer('בוב');
    const { rows: cat } = await adminPool().query(
      `select id from categories where slug = 'plumbing'`,
    );

    await expect(
      withUser(bob.id, (db) =>
        db.query(
          `insert into jobs (customer_id, raw_description, category_id, location)
           values ($1,'זיוף',$2, st_point(34.77,32.07)::geography)`,
          [alice.id, cat[0].id],
        ),
      ),
    ).rejects.toThrow();
  });
});
