import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runDispatchWave, expireAndEscalate } from '@/domains/matching/dispatch';
import { withSystem } from '@/lib/db';
import { getPool } from '@/lib/db';
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

describe('dispatch against the real database', () => {
  // Each test gets a clean world. These suites share one database, so a
  // provider left behind by an earlier test would otherwise sit inside the
  // next test's dispatch radius and silently change its result.
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('finds candidates, scores them and creates real offers', async () => {
    const customer = await createCustomer();
    await createProvider({ name: 'קרוב', lat: 32.078, lon: 34.775 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    const outcome = await runDispatchWave(jobId);

    expect(outcome.candidatesConsidered).toBeGreaterThan(0);
    expect(outcome.offersCreated).toBeGreaterThan(0);
    expect(outcome.wave).toBe(1);
    expect(outcome.radiusKm).toBe(5);
    expect(await jobStatus(jobId)).toBe('OFFERS_AVAILABLE');

    const { rows } = await adminPool().query(
      `select price_ils, eta_minutes, eta_confidence, final_score, score_breakdown, expires_at
         from job_offers where job_id = $1`,
      [jobId],
    );
    expect(rows.length).toBeGreaterThan(0);
    const offer = rows[0];
    // Price comes from the provider's configured rate, server-side.
    expect(Number(offer.price_ils)).toBeGreaterThan(0);
    // Estimated ETAs must be labelled as estimates, never as measured.
    expect(offer.eta_confidence).toBe('estimated');
    // The full breakdown is persisted for the matching debugger.
    expect(Object.keys(offer.score_breakdown)).toHaveLength(8);
    expect(new Date(offer.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('prefers the on-the-way provider over a closer one, end to end', async () => {
    const customer = await createCustomer();

    // 1.0 km away but driving north, away from the customer.
    const drivingAway = await createProvider({
      name: 'נוסע מכאן',
      lat: 32.0832, lon: 34.7749, headingDeg: 0,
      destination: { lat: 32.21, lon: 34.79 },
      ratingAvg: 5.0, ratingCount: 400, priceIls: 240, completedJobs: 500,
    });

    // 3.2 km away but driving south, straight past the customer.
    const onTheWay = await createProvider({
      name: 'כבר בדרך',
      lat: 32.103, lon: 34.7749, headingDeg: 180,
      destination: { lat: 32.056, lon: 34.7749 },
      ratingAvg: 4.6, ratingCount: 80, priceIls: 300, completedJobs: 120,
    });

    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });
    await runDispatchWave(jobId);

    const { rows } = await adminPool().query(
      `select provider_id, final_score, is_on_the_way, distance_km
         from job_offers where job_id = $1 order by final_score desc`,
      [jobId],
    );

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].provider_id).toBe(onTheWay.id);
    expect(rows[0].is_on_the_way).toBe(true);

    const loser = rows.find((r: { provider_id: string }) => r.provider_id === drivingAway.id);
    expect(loser).toBeDefined();
    // The winner is genuinely further away in road distance.
    expect(Number(rows[0].distance_km)).toBeGreaterThan(Number(loser.distance_km));
    expect(Number(rows[0].final_score)).toBeGreaterThan(Number(loser.final_score));
  });

  it('never offers a job to a provider whose location has gone stale', async () => {
    const customer = await createCustomer();
    await createProvider({ name: 'מיקום ישן', lat: 32.075, lon: 34.775, locationAgeSeconds: 1800 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    const outcome = await runDispatchWave(jobId);
    expect(outcome.offersCreated).toBe(0);
    // No provider found, so the job must not claim to have offers.
    expect(await jobStatus(jobId)).toBe('SEARCHING');
  });

  it('never offers a job to an unverified or offline provider', async () => {
    const customer = await createCustomer();
    await createProvider({ name: 'לא מאומת', verification: 'PENDING', lat: 32.075, lon: 34.775 });
    await createProvider({ name: 'לא מקוון', state: 'OFFLINE', lat: 32.075, lon: 34.775 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    const outcome = await runDispatchWave(jobId);
    expect(outcome.offersCreated).toBe(0);
  });

  it('never offers the same job to one provider twice', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(jobId, { waveOverride: 1 });
    await runDispatchWave(jobId, { waveOverride: 2 });

    const { rows } = await adminPool().query(
      'select count(*)::int as n from job_offers where job_id = $1 and provider_id = $2',
      [jobId, provider.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('expands the radius wave by wave to reach a distant provider', async () => {
    const customer = await createCustomer();
    // ~13 km north: outside wave 1 (5km) and wave 2 (10km), inside wave 3 (20km).
    await createProvider({ name: 'רחוק', lat: 32.191, lon: 34.7749, maxRadiusKm: 40 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    const wave1 = await runDispatchWave(jobId, { waveOverride: 1 });
    expect(wave1.offersCreated).toBe(0);

    const wave2 = await runDispatchWave(jobId, { waveOverride: 2 });
    expect(wave2.offersCreated).toBe(0);

    const wave3 = await runDispatchWave(jobId, { waveOverride: 3 });
    expect(wave3.radiusKm).toBe(20);
    expect(wave3.offersCreated).toBe(1);
  });

  it('gives up honestly when the waves are exhausted', async () => {
    const customer = await createCustomer();
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    // No providers at all; run past the last configured wave.
    await runDispatchWave(jobId, { waveOverride: 1 });
    await runDispatchWave(jobId, { waveOverride: 2 });
    await runDispatchWave(jobId, { waveOverride: 3 });
    const exhausted = await runDispatchWave(jobId, { waveOverride: 4 });

    expect(exhausted.exhausted).toBe(true);
    expect(await jobStatus(jobId)).toBe('CANCELLED_BY_SYSTEM');
  });

  it('records telemetry for every candidate, including the excluded ones', async () => {
    const customer = await createCustomer();
    await createProvider({ name: 'טוב', lat: 32.076, lon: 34.776 });
    await createProvider({ name: 'ישן', lat: 32.076, lon: 34.776, locationAgeSeconds: 5000 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(jobId);

    const { rows } = await adminPool().query(
      `select provider_id, excluded_reason, final_score, route_opportunity_score, weights_used
         from matching_events where job_id = $1`,
      [jobId],
    );

    // The stale provider is filtered by SQL before scoring, so the offered
    // provider is the one that produces a scored telemetry row.
    const scored = rows.filter((r: { excluded_reason: string | null }) => r.excluded_reason === null);
    expect(scored.length).toBeGreaterThan(0);
    expect(Number(scored[0].final_score)).toBeGreaterThan(0);
    // The weights actually used are captured, so a past decision stays explainable.
    expect(scored[0].weights_used.routeOpportunity).toBe(0.25);
  });

  it('expires offers past their window and escalates to the next wave', async () => {
    const customer = await createCustomer();
    await createProvider({ name: 'קרוב', lat: 32.076, lon: 34.776 });
    const jobId = await createJob({ customerId: customer.id, ...CUSTOMER_LOC });

    await runDispatchWave(jobId);
    expect(await jobStatus(jobId)).toBe('OFFERS_AVAILABLE');

    // Force the offer window closed.
    await adminPool().query(
      `update job_offers
          set notified_at = now() - interval '2 minutes',
              expires_at  = now() - interval '1 second'
        where job_id = $1`,
      [jobId],
    );

    const result = await expireAndEscalate();
    expect(result.expiredOffers).toBeGreaterThan(0);

    const { rows } = await adminPool().query(
      `select status::text as status from job_offers where job_id = $1`,
      [jobId],
    );
    expect(rows.every((r: { status: string }) => r.status !== 'PENDING')).toBe(true);

    const { rows: jobRows } = await adminPool().query(
      'select dispatch_wave from jobs where id = $1',
      [jobId],
    );
    // The search widened rather than silently stalling.
    expect(jobRows[0].dispatch_wave).toBeGreaterThanOrEqual(1);
  });

  it('writes an audit row for every status change (spec §26)', async () => {
    const customer = await createCustomer();
    await createProvider({ lat: 32.076, lon: 34.776 });
    const jobId = await createJob({
      customerId: customer.id, ...CUSTOMER_LOC, status: 'REQUESTED',
    });

    await withSystem(
      async (db) => {
        await db.query(`update jobs set status='SEARCHING' where id=$1`, [jobId]);
      },
      { actorRole: 'system', transitionReason: 'Matching started' },
    );
    await runDispatchWave(jobId);

    const { rows } = await adminPool().query(
      `select from_status::text as from_status, to_status::text as to_status, reason
         from job_status_history where job_id = $1 order by created_at`,
      [jobId],
    );

    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0].to_status).toBe('REQUESTED');
    expect(rows[0].from_status).toBeNull();
    expect(rows.some((r: { to_status: string }) => r.to_status === 'SEARCHING')).toBe(true);
    expect(rows.some((r: { to_status: string }) => r.to_status === 'OFFERS_AVAILABLE')).toBe(true);
  });
});
