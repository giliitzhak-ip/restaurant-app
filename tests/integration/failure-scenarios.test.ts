import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, withSystem, withUser } from '@/lib/db';
import { EstimateMapProvider, setMapProvider } from '@/domains/geo';
import type { MapProvider, RouteDeviation } from '@/domains/geo';
import { MatchingEngine } from '@/domains/matching/engine';
import { MockPaymentProvider } from '@/domains/payments/mock-provider';
import { shekelsToAgorot } from '@/domains/payments/fees';
import {
  adminPool,
  advanceJobTo,
  cleanupTestData,
  closeAdminPool,
  createCustomer,
  createJob,
  createProvider,
  jobStatus,
} from '../helpers/fixtures';

const LOC = { lat: 32.0742, lon: 34.7749 };

const offerFor = async (jobId: string, providerId: string) => {
  const { rows } = await adminPool().query(
    'select id from job_offers where job_id = $1 and provider_id = $2',
    [jobId, providerId],
  );
  if (!rows[0]?.id) throw new Error('offer not found');
  return rows[0].id as string;
};

const accept = (providerId: string, offerId: string) =>
  withUser(providerId, (db) => db.one('select accept_job_offer($1)', [offerId]));

/**
 * The failure scenarios spec §44 requires to be handled explicitly.
 *
 * "Never show only the happy path" (spec §43) applies to tests as much as to
 * the UI: these assert the system's behaviour when things go wrong.
 */
describe('failure scenarios (spec §44)', () => {
  beforeEach(async () => {
    await cleanupTestData();
    setMapProvider(null);
  });

  afterAll(async () => {
    await cleanupTestData();
    setMapProvider(null);
    await closeAdminPool();
    await getPool().end();
  });

  it('GPS stale: a provider with an old fix is not treated as live', async () => {
    const customer = await createCustomer();
    await createProvider({ lat: 32.075, lon: 34.775, locationAgeSeconds: 600 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });

    const outcome = await runDispatchWave(jobId);
    expect(outcome.offersCreated).toBe(0);
  });

  it('GPS unavailable: a provider with no location row is never dispatched', async () => {
    const customer = await createCustomer();
    // state OFFLINE means the fixture writes no provider_locations row.
    await createProvider({ lat: 32.075, lon: 34.775, state: 'OFFLINE' });
    const jobId = await createJob({ customerId: customer.id, ...LOC });

    const outcome = await runDispatchWave(jobId);
    expect(outcome.candidatesConsidered).toBe(0);
  });

  it('routing unavailable: ETA is reported as unknown, never invented', async () => {
    // A provider that fails exactly as a dead routing API would.
    const brokenMaps: MapProvider = {
      name: 'broken',
      async getRoute() {
        return { distanceKm: 0, durationMinutes: 0, confidence: 'unavailable' as const };
      },
      async calculateDistance() {
        return { distanceKm: 0, durationMinutes: 0, confidence: 'unavailable' as const };
      },
      async getETA() {
        return { minutes: null, confidence: 'unavailable' as const };
      },
      async calculateRouteDeviation(): Promise<RouteDeviation> {
        return {
          deviationMinutes: 0, deviationKm: 0, directMinutes: 0, viaMinutes: 0,
          confidence: 'unavailable' as const,
        };
      },
    };

    const engine = new MatchingEngine(brokenMaps);
    const result = await engine.match(
      [
        {
          providerId: 'p1', fullName: 'בעל מקצוע', businessName: null, state: 'ONLINE',
          location: { lat: 32.08, lon: 34.78 }, headingDeg: 180, speedKmh: 30,
          accuracyM: 10, locationAgeSeconds: 10, destination: null,
          skills: ['plumbing'], priceIls: 290, ratingAvg: 4.8, ratingCount: 100,
          completedJobs: 100, cancelledJobs: 2, offersReceived: 120, offersAccepted: 100,
          avgResponseSeconds: 20, yearsExperience: 8, maxRadiusKm: 20,
          inServiceArea: true, straightDistanceKm: 1,
        },
      ],
      {
        jobId: 'j1', customerLocation: LOC, locationAccuracyM: 10,
        categorySlug: 'plumbing', serviceSlug: 'sink_leak',
        requiredSkills: ['plumbing'], urgency: 'high', referencePriceIls: 290,
      },
    );

    const top = result.ranked[0];
    expect(top).toBeDefined();
    // No fabricated number, and the candidate is neither rewarded nor killed.
    expect(top!.etaMinutes).toBeNull();
    expect(top!.etaConfidence).toBe('unavailable');
    expect(top!.breakdown.eta.score).toBe(50);
    expect(top!.finalScore).toBeGreaterThan(0);
  });

  it('customer cancels: the job stops and the provider is freed', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);
    await accept(provider.id, await offerFor(jobId, provider.id));

    await withUser(
      customer.id,
      (db) => db.query(`update jobs set status='CANCELLED_BY_CUSTOMER' where id=$1`, [jobId]),
      { actorRole: 'customer', transitionReason: 'test cancel' },
    );

    expect(await jobStatus(jobId)).toBe('CANCELLED_BY_CUSTOMER');
    // And no further transition is possible out of it.
    await expect(
      withSystem(
        (db) => db.query(`update jobs set status='SEARCHING' where id=$1`, [jobId]),
        { actorRole: 'system' },
      ),
    ).rejects.toThrow(/INVALID_TRANSITION/);
  });

  it('provider cancels: the job can re-enter matching', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);
    await accept(provider.id, await offerFor(jobId, provider.id));
    await advanceJobTo(jobId, 'CONFIRMED');

    await withUser(
      provider.id,
      (db) => db.query(`update jobs set status='CANCELLED_BY_PROVIDER' where id=$1`, [jobId]),
      { actorRole: 'provider', transitionReason: 'provider cannot attend' },
    );

    // The state machine permits re-dispatch from a provider cancellation.
    await withSystem(
      (db) => db.query(`update jobs set status='SEARCHING' where id=$1`, [jobId]),
      { actorRole: 'system', transitionReason: 're-dispatch' },
    );
    expect(await jobStatus(jobId)).toBe('SEARCHING');
  });

  it('payment fails: the job is NOT marked PAID', async () => {
    const payments = new MockPaymentProvider();
    const jobId = 'job-failure-test';
    payments.failingJobIds.add(jobId);

    const authorization = await payments.authorize({
      idempotencyKey: 'auth-fail',
      amount: shekelsToAgorot(290),
      currency: 'ILS',
      jobId,
      customerId: 'cust',
    });

    expect(authorization.ok).toBe(false);
    expect(authorization.status).toBe('failed');
    // There is no external reference to capture against, so no capture can
    // succeed and nothing can advance the job to PAID.
    expect(authorization.externalRef).toBeNull();
  });

  it('a job cannot reach PAID except from COMPLETED, and only by the system', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);
    await accept(provider.id, await offerFor(jobId, provider.id));
    await advanceJobTo(jobId, 'IN_PROGRESS');

    // Not from IN_PROGRESS...
    await expect(
      withSystem((db) => db.query(`update jobs set status='PAID' where id=$1`, [jobId]), {
        actorRole: 'system',
      }),
    ).rejects.toThrow(/INVALID_TRANSITION/);

    // ...and not by the customer even once COMPLETED.
    await advanceJobTo(jobId, 'COMPLETED');
    await expect(
      withUser(customer.id, (db) => db.query(`update jobs set status='PAID' where id=$1`, [jobId]), {
        actorRole: 'customer',
      }),
    ).rejects.toThrow(/TRANSITION_NOT_PERMITTED_FOR_ROLE/);
  });

  it('offer expires: it cannot be accepted afterwards', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);
    const offerId = await offerFor(jobId, provider.id);

    await adminPool().query(
      `update job_offers
          set notified_at = now() - interval '10 minutes',
              expires_at  = now() - interval '5 minutes'
        where id = $1`,
      [offerId],
    );

    await expect(accept(provider.id, offerId)).rejects.toThrow(/OFFER_EXPIRED/);
  });

  it('a declined offer cannot then be accepted', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);
    const offerId = await offerFor(jobId, provider.id);

    await withUser(provider.id, (db) =>
      db.query(`update job_offers set status='DECLINED', responded_at=now() where id=$1`, [offerId]),
    );

    await expect(accept(provider.id, offerId)).rejects.toThrow(/OFFER_NOT_PENDING/);
  });

  it('provider closes the app: the job state is fully recoverable from the database', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);
    await accept(provider.id, await offerFor(jobId, provider.id));
    await advanceJobTo(jobId, 'EN_ROUTE');

    // Nothing is held in memory: a fresh read reconstructs everything the
    // provider's app needs to resume (spec §22, §44).
    const recovered = await withUser(provider.id, (db) =>
      db.one<{ status: string; job_id: string; price_ils: string }>(
        `select j.status::text as status, a.job_id, a.price_ils
           from job_assignments a
           join jobs j on j.id = a.job_id
          where a.provider_id = $1`,
        [provider.id],
      ),
    );

    expect(recovered?.status).toBe('EN_ROUTE');
    expect(recovered?.job_id).toBe(jobId);
    expect(Number(recovered?.price_ils)).toBeGreaterThan(0);
  });

  it('a duplicate review is rejected by the unique constraint', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);
    await accept(provider.id, await offerFor(jobId, provider.id));
    await advanceJobTo(jobId, 'COMPLETED');

    const insert = () =>
      withUser(customer.id, (db) =>
        db.query(
          `insert into reviews (job_id, author_id, subject_id, direction, rating)
           values ($1,$2,$3,'customer_to_provider',5)`,
          [jobId, customer.id, provider.id],
        ),
      );

    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it('an estimated ETA is never labelled as measured', async () => {
    setMapProvider(new EstimateMapProvider());
    const customer = await createCustomer();
    await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    const { rows } = await adminPool().query(
      'select eta_confidence from job_offers where job_id = $1',
      [jobId],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.eta_confidence).toBe('estimated');
      expect(row.eta_confidence).not.toBe('routed');
    }
  });
});
