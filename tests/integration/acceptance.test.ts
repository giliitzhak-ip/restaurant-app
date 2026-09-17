import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, pgErrorName, withUser } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createCustomer,
  createJob,
  createProvider,
  jobStatus,
} from '../helpers/fixtures';

const CUSTOMER_LOC = { lat: 32.0742, lon: 34.7749 };

async function offerFor(jobId: string, providerId: string): Promise<string> {
  const { rows } = await adminPool().query(
    'select id from job_offers where job_id = $1 and provider_id = $2',
    [jobId, providerId],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`No offer for provider ${providerId} on job ${jobId}`);
  return id;
}

const accept = (providerId: string, offerId: string) =>
  withUser(providerId, (db) => db.one('select accept_job_offer($1) as result', [offerId]));

describe('transactional offer acceptance (spec §25)', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('assigns the job to the accepting provider and makes them BUSY', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
    await runDispatchWave(jobId);

    await accept(provider.id, await offerFor(jobId, provider.id));

    expect(await jobStatus(jobId)).toBe('PROVIDER_SELECTED');

    const { rows } = await adminPool().query(
      `select a.provider_id, a.price_ils, pp.state::text as state
         from job_assignments a
         join provider_profiles pp on pp.id = a.provider_id
        where a.job_id = $1`,
      [jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].provider_id).toBe(provider.id);
    expect(rows[0].state).toBe('BUSY');
    expect(Number(rows[0].price_ils)).toBeGreaterThan(0);
  });

  it('THE RACE: two providers accepting at once — exactly one wins', async () => {
    const customer = await createCustomer();
    const a = await createProvider({ name: 'ראשון', lat: 32.0755, lon: 34.7755 });
    const b = await createProvider({ name: 'שני', lat: 32.0756, lon: 34.7756 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
    await runDispatchWave(jobId);

    const [offerA, offerB] = await Promise.all([
      offerFor(jobId, a.id),
      offerFor(jobId, b.id),
    ]);

    // Fired together, on separate pooled connections.
    const results = await Promise.allSettled([
      accept(a.id, offerA),
      accept(b.id, offerB),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The loser gets the specific, actionable error — not a deadlock or a
    // generic 500.
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(pgErrorName(reason)).toBe('JOB_ALREADY_ASSIGNED');

    // And the database holds exactly one assignment.
    const { rows } = await adminPool().query(
      'select count(*)::int as n from job_assignments where job_id = $1',
      [jobId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('survives the race repeatedly, not just once', async () => {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      await cleanupTestData();
      const customer = await createCustomer();
      const providers = await Promise.all([
        createProvider({ name: 'מקצוען א', lat: 32.0751, lon: 34.7751 }),
        createProvider({ name: 'מקצוען ב', lat: 32.0752, lon: 34.7752 }),
        createProvider({ name: 'מקצוען ג', lat: 32.0753, lon: 34.7753 }),
        createProvider({ name: 'מקצוען ד', lat: 32.0754, lon: 34.7754 }),
      ]);
      const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
      await runDispatchWave(jobId);

      const offers = await Promise.all(
        providers.map((p) => offerFor(jobId, p.id).then((id) => ({ p, id }))),
      );
      const results = await Promise.allSettled(
        offers.map(({ p, id }) => accept(p.id, id)),
      );

      expect(
        results.filter((r) => r.status === 'fulfilled'),
        `iteration ${iteration}`,
      ).toHaveLength(1);

      const { rows } = await adminPool().query(
        'select count(*)::int as n from job_assignments where job_id = $1',
        [jobId],
      );
      expect(rows[0].n, `iteration ${iteration}`).toBe(1);
    }
  });

  it('refuses an expired offer (spec §44)', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
    await runDispatchWave(jobId);
    const offerId = await offerFor(jobId, provider.id);

    await adminPool().query(
      `update job_offers
          set notified_at = now() - interval '5 minutes',
              expires_at  = now() - interval '1 second'
        where id = $1`,
      [offerId],
    );

    await expect(accept(provider.id, offerId)).rejects.toThrow();
    const { rows } = await adminPool().query(
      'select count(*)::int as n from job_assignments where job_id = $1',
      [jobId],
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuses a second acceptance of the same offer', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
    await runDispatchWave(jobId);
    const offerId = await offerFor(jobId, provider.id);

    await accept(provider.id, offerId);
    await expect(accept(provider.id, offerId)).rejects.toThrow();
  });

  it('cancels every competing offer when one is accepted', async () => {
    const customer = await createCustomer();
    const winner = await createProvider({ name: 'זוכה', lat: 32.0755, lon: 34.7755 });
    await createProvider({ name: 'אחר', lat: 32.0756, lon: 34.7756 });
    await createProvider({ name: 'שלישי', lat: 32.0757, lon: 34.7757 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
    await runDispatchWave(jobId);

    await accept(winner.id, await offerFor(jobId, winner.id));

    const { rows } = await adminPool().query(
      `select status::text as status, provider_id from job_offers where job_id = $1`,
      [jobId],
    );
    const accepted = rows.filter((r: { status: string }) => r.status === 'ACCEPTED');
    const cancelled = rows.filter((r: { status: string }) => r.status === 'CANCELLED');
    expect(accepted).toHaveLength(1);
    expect(accepted[0].provider_id).toBe(winner.id);
    expect(cancelled.length).toBe(rows.length - 1);
  });

  it('records acceptance in the matching telemetry with a response time', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
    await runDispatchWave(jobId);
    await accept(provider.id, await offerFor(jobId, provider.id));

    const { rows } = await adminPool().query(
      `select accepted, response_seconds from matching_events
        where job_id = $1 and provider_id = $2 and offer_id is not null`,
      [jobId, provider.id],
    );
    expect(rows[0].accepted).toBe(true);
    expect(Number(rows[0].response_seconds)).toBeGreaterThanOrEqual(0);
  });

  it('will not offer a new job to a provider who is already engaged', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const firstJob = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
    await runDispatchWave(firstJob);
    await accept(provider.id, await offerFor(firstJob, provider.id));

    // A second job in the same spot must not reach the busy provider.
    const secondCustomer = await createCustomer();
    const secondJob = await createJob({ customerId: secondCustomer.id, ...CUSTOMER_LOC });
    const outcome = await runDispatchWave(secondJob);

    expect(outcome.offersCreated).toBe(0);
  });
});
