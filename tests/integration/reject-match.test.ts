import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { expireAndEscalate, runDispatchWave } from '@/domains/matching/dispatch';
import { MAX_REJECTIONS, rejectMatch } from '@/domains/jobs/reject-match';
import { getPool, withSystem, withUser } from '@/lib/db';
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
  const { rows } = await adminPool().query<{ id: string }>(
    'select id from job_offers where job_id = $1 and provider_id = $2',
    [jobId, providerId],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`No offer for provider ${providerId} on job ${jobId}`);
  return id;
}

/** Whoever holds the assignment right now. */
async function assignedProvider(jobId: string): Promise<string | null> {
  const { rows } = await adminPool().query<{ provider_id: string }>(
    'select provider_id from job_assignments where job_id = $1',
    [jobId],
  );
  return rows[0]?.provider_id ?? null;
}

async function providerState(providerId: string): Promise<string> {
  const { rows } = await adminPool().query<{ state: string }>(
    'select state::text as state from provider_profiles where id = $1',
    [providerId],
  );
  return rows[0]!.state;
}

/** Accept the first pending offer on the job, whoever holds it. */
async function firstAcceptWins(jobId: string): Promise<string> {
  const { rows } = await adminPool().query<{ id: string; provider_id: string }>(
    `select id, provider_id from job_offers
      where job_id = $1 and status = 'PENDING'
      order by final_score desc nulls last limit 1`,
    [jobId],
  );
  const offer = rows[0];
  if (!offer) throw new Error('No pending offer to accept');
  await withUser(offer.provider_id, (db) =>
    db.query('select accept_job_offer($1)', [offer.id]),
  );
  return offer.provider_id;
}

/**
 * Rejecting a match without abandoning the request (spec §10, §19).
 *
 * The product settled on first-accept-wins: offers go to several providers at
 * once and the first to accept gets the job. That makes the match fast, and
 * it means the customer sees ONE match rather than a shortlist — so the only
 * previous way out of an unwanted match was cancelling the whole request.
 * Rejecting a person and abandoning a job are different intentions, and these
 * tests pin the difference.
 */
describe('rejecting a match (first-accept-wins)', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('frees the provider, keeps the job alive, and matches someone else', async () => {
    const customer = await createCustomer();
    const first = await createProvider({ name: 'ראשון', lat: 32.075, lon: 34.775 });
    const second = await createProvider({ name: 'שני', lat: 32.076, lon: 34.776 });
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);
    const accepted = await firstAcceptWins(job);
    expect(await jobStatus(job)).toBe('PROVIDER_SELECTED');
    expect(await providerState(accepted)).toBe('BUSY');

    const result = await rejectMatch({ jobId: job, customerId: customer.id });

    // The request survives, and the rejected provider is released rather than
    // left holding a job nobody is doing.
    expect(result.rejectedProviderId).toBe(accepted);
    expect(await providerState(accepted)).toBe('ONLINE');
    expect(result.rejectionsUsed).toBe(1);

    // And someone else got the offer.
    const other = accepted === first.id ? second.id : first.id;
    expect(result.dispatch?.offersCreated).toBeGreaterThan(0);
    const { rows } = await adminPool().query<{ provider_id: string; status: string }>(
      `select provider_id, status::text as status from job_offers
        where job_id = $1 and status = 'PENDING'`,
      [job],
    );
    expect(rows.map((r) => r.provider_id)).toEqual([other]);
    expect(await jobStatus(job)).toBe('OFFERS_AVAILABLE');
  });

  it('never re-offers the rejected provider', async () => {
    const customer = await createCustomer();
    // Only ONE provider exists, so if the exclusion failed they would be
    // offered the same job straight back.
    const only = await createProvider({ name: 'היחיד', lat: 32.075, lon: 34.775 });
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);
    const offer = await offerFor(job, only.id);
    await withUser(only.id, (db) => db.query('select accept_job_offer($1)', [offer]));

    const result = await rejectMatch({ jobId: job, customerId: customer.id });

    expect(result.dispatch?.offersCreated).toBe(0);
    const { rows } = await adminPool().query<{ n: string }>(
      `select count(*) as n from job_offers where job_id = $1 and status = 'PENDING'`,
      [job],
    );
    expect(rows[0]!.n).toBe('0');

    // The job is left SEARCHING rather than cancelled: wave 1 found nobody,
    // which is not the same as the network being exhausted. The maintenance
    // tick escalates it through the remaining waves, and only when those run
    // out does the system give up — which it must, or the request hangs
    // forever on a provider who will never be re-offered.
    expect(await jobStatus(job)).toBe('SEARCHING');

    for (let i = 0; i < 4; i += 1) await expireAndEscalate();
    expect(await jobStatus(job)).toBe('CANCELLED_BY_SYSTEM');
  });

  it('does not count the rejection against the provider', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);
    const offer = await offerFor(job, provider.id);
    await withUser(provider.id, (db) => db.query('select accept_job_offer($1)', [offer]));

    // Compared before and after rather than against zero: the fixture seeds a
    // non-zero history, and asserting 0 would pass for the wrong reason.
    const cancelledJobs = async () => {
      const { rows } = await adminPool().query<{ cancelled_jobs: number }>(
        'select cancelled_jobs from provider_profiles where id = $1',
        [provider.id],
      );
      return rows[0]!.cancelled_jobs;
    };
    const before = await cancelledJobs();

    await rejectMatch({ jobId: job, customerId: customer.id });

    // They accepted in good faith. A reliability score that punishes them for
    // someone else's change of mind is a broken score.
    expect(await cancelledJobs()).toBe(before);
  });

  it('caps rejections so the button cannot be used as a directory', async () => {
    const customer = await createCustomer();
    // Enough providers that the cap, not supply, is what stops the customer.
    for (let i = 0; i < MAX_REJECTIONS + 2; i += 1) {
      await createProvider({ name: `מקצוען ${i}`, lat: 32.075 + i * 0.001, lon: 34.775 });
    }
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);

    for (let i = 1; i <= MAX_REJECTIONS; i += 1) {
      await firstAcceptWins(job);
      const result = await rejectMatch({ jobId: job, customerId: customer.id });
      expect(result.rejectionsUsed).toBe(i);
    }

    await firstAcceptWins(job);
    await expect(rejectMatch({ jobId: job, customerId: customer.id })).rejects.toThrow(
      /דחית כבר שלוש/,
    );

    // The match is still standing: refusing the rejection must not also
    // destroy the assignment the customer still has.
    expect(await jobStatus(job)).toBe('PROVIDER_SELECTED');
    expect(await assignedProvider(job)).not.toBeNull();
  });

  it('refuses when there is no match to reject', async () => {
    const customer = await createCustomer();
    await createProvider({ lat: 32.075, lon: 34.775 });
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);
    // Offers are out but nobody has accepted.
    await expect(rejectMatch({ jobId: job, customerId: customer.id })).rejects.toThrow(
      /עדיין מחפשים/,
    );
  });

  it('refuses once the customer has confirmed', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);
    const offer = await offerFor(job, provider.id);
    await withUser(provider.id, (db) => db.query('select accept_job_offer($1)', [offer]));
    await withUser(
      customer.id,
      (db) => db.query(`update jobs set status = 'CONFIRMED' where id = $1`, [job]),
      { actorRole: 'customer', transitionReason: 'Customer confirms the match' },
    );

    // The provider may already be driving. That is a cancellation, with its
    // own consequences, not a rejection.
    await expect(rejectMatch({ jobId: job, customerId: customer.id })).rejects.toThrow(
      /אישרת את ההזמנה/,
    );
    expect(await jobStatus(job)).toBe('CONFIRMED');
  });

  /**
   * The same fix repairs provider withdrawal, which shipped broken.
   *
   * `failure-scenarios.test.ts` asserted only that the state machine PERMITS
   * CANCELLED_BY_PROVIDER → SEARCHING. It never re-dispatched, so it passed
   * while re-dispatch reached nobody: every provider who had merely lost the
   * race to the withdrawing provider was excluded by their cancelled offer
   * row. In a thin market that is the whole wave.
   */
  it('re-offers a race loser after the winning provider withdraws', async () => {
    const customer = await createCustomer();
    await createProvider({ name: 'ראשון', lat: 32.075, lon: 34.775 });
    await createProvider({ name: 'שני', lat: 32.076, lon: 34.776 });
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);
    const winner = await firstAcceptWins(job);

    // Everyone else's offer is CANCELLED the moment the winner accepts —
    // they were never asked to decide anything.
    const { rows: cancelled } = await adminPool().query<{ n: string }>(
      `select count(*) as n from job_offers
        where job_id = $1 and status = 'CANCELLED' and decline_reason is null`,
      [job],
    );
    expect(cancelled[0]!.n).toBe('1');

    // The winner withdraws, exactly as the transition endpoint does it.
    await withSystem(async (db) => {
      await db.query(
        `update provider_profiles set state = 'ONLINE' where id = $1 and state = 'BUSY'`,
        [winner],
      );
      await db.query('delete from job_assignments where job_id = $1', [job]);
      await db.query(
        `update job_offers set status = 'DECLINED', decline_reason = 'provider withdrew'
          where job_id = $1 and provider_id = $2`,
        [job, winner],
      );
    });
    await withSystem(
      (db) => db.query(`update jobs set status = 'SEARCHING' where id = $1`, [job]),
      { actorRole: 'system', transitionReason: 'Re-dispatch after provider cancellation' },
    );

    const outcome = await runDispatchWave(job, { waveOverride: 1 });

    expect(outcome.offersCreated).toBe(1);
    const { rows: pending } = await adminPool().query<{ provider_id: string }>(
      `select provider_id from job_offers where job_id = $1 and status = 'PENDING'`,
      [job],
    );
    expect(pending.map((r) => r.provider_id)).not.toContain(winner);
    expect(pending).toHaveLength(1);
  });

  it('counts one acceptance, not two, when a revived offer is accepted', async () => {
    const customer = await createCustomer();
    await createProvider({ name: 'ראשון', lat: 32.075, lon: 34.775 });
    await createProvider({ name: 'שני', lat: 32.076, lon: 34.776 });
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);
    await firstAcceptWins(job);
    await rejectMatch({ jobId: job, customerId: customer.id });

    // The revived offer reuses its row, so its earlier telemetry event has to
    // stop pointing at it — accept_job_offer() marks acceptance by offer_id,
    // and two events sharing one id would both be marked.
    const second = await firstAcceptWins(job);

    const { rows } = await adminPool().query<{ n: string }>(
      `select count(*) as n from matching_events
        where job_id = $1 and provider_id = $2 and accepted`,
      [job, second],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it("is not a way into someone else's job", async () => {
    const customer = await createCustomer();
    const stranger = await createCustomer('זר');
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const job = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(job);
    const offer = await offerFor(job, provider.id);
    await withUser(provider.id, (db) => db.query('select accept_job_offer($1)', [offer]));

    // RLS makes the row invisible, so this is a 404 rather than a 403: the
    // stranger learns nothing about whether the job exists.
    await expect(rejectMatch({ jobId: job, customerId: stranger.id })).rejects.toThrow(
      /לא נמצאה/,
    );
    expect(await jobStatus(job)).toBe('PROVIDER_SELECTED');
  });
});
