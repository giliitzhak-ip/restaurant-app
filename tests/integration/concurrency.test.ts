import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, withUser } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createCustomer,
  createJob,
  createProvider,
} from '../helpers/fixtures';

const LOC = { lat: 32.0742, lon: 34.7749 };

/**
 * Concurrency and throughput (SCORE §10).
 *
 * "First to accept takes the job" is the product's own promise, and until
 * now it rested on reading `accept_job_offer` and believing it. Belief is not
 * a test: the interesting case is two providers pressing accept in the same
 * millisecond, and the only way to know is to actually do that.
 */
describe('acceptance under concurrency', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  const accept = (providerId: string, offerId: string) =>
    withUser(providerId, (db) =>
      db.one<{ accept_job_offer: Record<string, unknown> }>(
        'select accept_job_offer($1) as accept_job_offer',
        [offerId],
      ),
    );

  it('five providers accepting at once produce exactly one winner', async () => {
    const customer = await createCustomer();
    const providers = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createProvider({
          name: `מתחרה ${i}`,
          lat: 32.075 + i * 0.002,
          lon: 34.775 + i * 0.002,
        }),
      ),
    );

    const jobId = await createJob({ customerId: customer.id, ...LOC });
    const outcome = await runDispatchWave(jobId);
    expect(outcome.offersCreated).toBeGreaterThan(1);

    const offers = await adminPool().query<{ id: string; provider_id: string }>(
      `select id, provider_id from job_offers where job_id = $1 and status = 'PENDING'`,
      [jobId],
    );
    expect(offers.rows.length).toBeGreaterThan(1);

    // Everybody presses at the same time. `allSettled`, because losing is
    // expected to be an exception rather than a false return.
    const results = await Promise.allSettled(
      offers.rows.map((offer) => accept(offer.provider_id, offer.id)),
    );

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(offers.rows.length - 1);

    // And the loser is told which failure it was, rather than a generic error.
    for (const failure of lost) {
      const message = String((failure as PromiseRejectedResult).reason);
      expect(message).toMatch(/JOB_ALREADY_ASSIGNED|OFFER_NOT_PENDING|JOB_NOT_MATCHABLE/);
    }

    // The database agrees: one assignment, one accepted offer, and the job
    // has moved on.
    const state = await adminPool().query<{
      assignments: string; accepted: string; status: string;
    }>(
      `select (select count(*)::text from job_assignments where job_id = $1) as assignments,
              (select count(*)::text from job_offers where job_id = $1 and status = 'ACCEPTED') as accepted,
              (select status::text from jobs where id = $1) as status`,
      [jobId],
    );
    expect(state.rows[0]).toMatchObject({ assignments: '1', accepted: '1' });
    expect(state.rows[0]!.status).not.toBe('SEARCHING');

    // The winner is BUSY and nobody else was left holding the job.
    const busy = await adminPool().query<{ n: string }>(
      `select count(*)::text as n from provider_profiles
        where id = any($1::uuid[]) and state = 'BUSY'`,
      [providers.map((p) => p.id)],
    );
    expect(busy.rows[0]!.n).toBe('1');
  });

  it('the same provider pressing twice does not create a second assignment', async () => {
    const customer = await createCustomer();
    await createProvider({ name: 'לוחץ פעמיים', lat: 32.075, lon: 34.775 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    const offer = await adminPool().query<{ id: string; provider_id: string }>(
      `select id, provider_id from job_offers where job_id = $1 limit 1`,
      [jobId],
    );
    const { id, provider_id: providerId } = offer.rows[0]!;

    // A double tap, or a retried request.
    const results = await Promise.allSettled([
      accept(providerId, id),
      accept(providerId, id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const { rows } = await adminPool().query<{ n: string }>(
      'select count(*)::text as n from job_assignments where job_id = $1',
      [jobId],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('twenty jobs dispatched at once all get offers, and none cross over', async () => {
    const customer = await createCustomer();
    // Enough providers that every job can be served, spread so they are all
    // inside the first wave's radius.
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        createProvider({
          name: `ספק ${i}`,
          lat: 32.07 + (i % 4) * 0.004,
          lon: 34.77 + Math.floor(i / 4) * 0.004,
        }),
      ),
    );

    const jobIds = await Promise.all(
      Array.from({ length: 20 }, () => createJob({ customerId: customer.id, ...LOC })),
    );

    const startedAt = Date.now();
    const outcomes = await Promise.all(jobIds.map((id) => runDispatchWave(id)));
    const elapsedMs = Date.now() - startedAt;

    // Every job found somebody. A dispatch that silently returns nobody under
    // load is the failure this asserts against.
    for (const outcome of outcomes) {
      expect(outcome.offersCreated).toBeGreaterThan(0);
    }

    // No offer belongs to a job other than its own, and no provider holds two
    // offers for one job.
    const integrity = await adminPool().query<{ crossed: string; duplicated: string }>(
      `select
         (select count(*)::text from job_offers o
           where o.job_id = any($1::uuid[])
             and not exists (select 1 from jobs j where j.id = o.job_id)) as crossed,
         (select count(*)::text from (
            select job_id, provider_id from job_offers
             where job_id = any($1::uuid[])
             group by job_id, provider_id having count(*) > 1
          ) d) as duplicated`,
      [jobIds],
    );
    expect(integrity.rows[0]).toEqual({ crossed: '0', duplicated: '0' });

    // Not a benchmark — a smoke alarm. Twenty concurrent dispatches against a
    // 12-provider network should be seconds, and a regression that makes it
    // minutes is worth failing over.
    expect(elapsedMs).toBeLessThan(20_000);
  });
});
