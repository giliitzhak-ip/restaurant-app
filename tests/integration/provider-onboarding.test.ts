import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, withUser } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createBareProvider,
  createCustomer,
  createJob,
} from '../helpers/fixtures';

const LOC = { lat: 32.0742, lon: 34.7749 };

/**
 * Provider onboarding.
 *
 * The property under test is not "the form saves" but "the account becomes
 * matchable". Registration alone leaves a provider that
 * find_candidate_providers can never return, because it INNER JOINs
 * provider_categories — so the interesting assertions are before/after.
 */
async function onboard(
  providerId: string,
  opts: { lat?: number; lon?: number; radiusKm?: number; priceIls?: number } = {},
) {
  const { lat = LOC.lat, lon = LOC.lon, radiusKm = 25, priceIls = 300 } = opts;
  const db = adminPool();
  const { rows: cat } = await db.query(
    `select id, required_skills from categories where slug = 'plumbing'`,
  );
  const { rows: svc } = await db.query(
    `select s.id from services s where s.category_id = $1 and s.slug = 'sink_leak'`,
    [cat[0].id],
  );

  // Written through the PROVIDER's own connection, so the RLS policies that
  // the real endpoint relies on are the thing authorising these writes.
  await withUser(providerId, async (session) => {
    await session.query(
      `update provider_profiles set years_experience = 7, max_radius_km = $2 where id = $1`,
      [providerId, radiusKm],
    );
    await session.query(
      `insert into provider_categories (provider_id, category_id, skills, is_primary)
       values ($1,$2,$3,true)`,
      [providerId, cat[0].id, cat[0].required_skills],
    );
    await session.query(
      `insert into provider_services (provider_id, service_id, price_ils, is_active)
       values ($1,$2,$3,true)`,
      [providerId, svc[0].id, priceIls],
    );
    await session.query(
      `insert into service_areas (provider_id, label, center, radius_km, is_active)
       values ($1,'אזור עבודה ראשי', st_point($3,$2)::geography, $4, true)`,
      [providerId, lat, lon, radiusKm],
    );
  });
}

/** Bring the provider online with a fresh fix, as the console does. */
async function goOnline(providerId: string, lat = LOC.lat, lon = LOC.lon) {
  await adminPool().query(
    `update provider_profiles set state = 'ONLINE' where id = $1`,
    [providerId],
  );
  await withUser(providerId, async (db) => {
    await db.query(
      `insert into provider_locations (provider_id, location, heading_deg, speed_kmh, accuracy_m, recorded_at)
       values ($1, st_point($3,$2)::geography, 180, 30, 10, now())
       on conflict (provider_id) do update set location = excluded.location, recorded_at = now()`,
      [providerId, lat, lon],
    );
  });
}

describe('provider onboarding', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('a registered but unconfigured provider is NOT a candidate at all', async () => {
    const customer = await createCustomer();
    const provider = await createBareProvider({ verification: 'VERIFIED' });
    await goOnline(provider.id);

    const jobId = await createJob({ customerId: customer.id, ...LOC });
    const outcome = await runDispatchWave(jobId);

    // Not ranked low — absent. This is the gap onboarding closes.
    expect(outcome.candidatesConsidered).toBe(0);
    expect(outcome.offersCreated).toBe(0);
  });

  it('becomes matchable once onboarded and verified', async () => {
    const customer = await createCustomer();
    const provider = await createBareProvider({ verification: 'VERIFIED' });
    await onboard(provider.id);
    await goOnline(provider.id);

    const jobId = await createJob({ customerId: customer.id, ...LOC });
    const outcome = await runDispatchWave(jobId);

    expect(outcome.candidatesConsidered).toBe(1);
    expect(outcome.offersCreated).toBe(1);

    const { rows } = await adminPool().query(
      'select provider_id, price_ils from job_offers where job_id = $1',
      [jobId],
    );
    expect(rows[0].provider_id).toBe(provider.id);
    // The offer carries the price the PROVIDER set, not the catalog guide.
    expect(Number(rows[0].price_ils)).toBe(300);
  });

  it('onboarded but still PENDING is not offered work', async () => {
    const customer = await createCustomer();
    const provider = await createBareProvider({ verification: 'PENDING' });
    await onboard(provider.id);
    await goOnline(provider.id);

    const jobId = await createJob({ customerId: customer.id, ...LOC });
    const outcome = await runDispatchWave(jobId);

    // Configured, online — and still gated on verification (spec §31).
    expect(outcome.candidatesConsidered).toBe(0);
  });

  it('a provider can configure their own trade, and only their own', async () => {
    const mine = await createBareProvider({ name: 'שלי' });
    const theirs = await createBareProvider({ name: 'שלהם' });
    const { rows: cat } = await adminPool().query(
      `select id, required_skills from categories where slug = 'electrical'`,
    );

    // Their own row: allowed.
    await withUser(mine.id, (db) =>
      db.query(
        `insert into provider_categories (provider_id, category_id, skills, is_primary)
         values ($1,$2,$3,true)`,
        [mine.id, cat[0].id, cat[0].required_skills],
      ),
    );

    // Someone else's: refused by RLS, not by application code.
    await expect(
      withUser(mine.id, (db) =>
        db.query(
          `insert into provider_categories (provider_id, category_id, skills, is_primary)
           values ($1,$2,$3,true)`,
          [theirs.id, cat[0].id, cat[0].required_skills],
        ),
      ),
    ).rejects.toThrow();

    const { rows } = await adminPool().query(
      'select count(*)::int as n from provider_categories where provider_id = $1',
      [theirs.id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('a provider still cannot verify themselves after onboarding', async () => {
    const provider = await createBareProvider({ verification: 'PENDING' });
    await onboard(provider.id);

    await expect(
      withUser(provider.id, (db) =>
        db.query(`update provider_profiles set verification = 'VERIFIED' where id = $1`, [
          provider.id,
        ]),
      ),
    ).rejects.toThrow(/VERIFICATION_CHANGE_FORBIDDEN/);
  });

  it('re-onboarding replaces the trade instead of accumulating trades', async () => {
    const provider = await createBareProvider({ verification: 'VERIFIED' });
    await onboard(provider.id);

    // Switch trade the way the endpoint does: delete, then insert.
    const { rows: cat } = await adminPool().query(
      `select id, required_skills from categories where slug = 'electrical'`,
    );
    await withUser(provider.id, async (db) => {
      await db.query('delete from provider_categories where provider_id = $1', [provider.id]);
      await db.query(
        `insert into provider_categories (provider_id, category_id, skills, is_primary)
         values ($1,$2,$3,true)`,
        [provider.id, cat[0].id, cat[0].required_skills],
      );
    });

    const { rows } = await adminPool().query(
      `select c.slug from provider_categories pc
         join categories c on c.id = pc.category_id
        where pc.provider_id = $1`,
      [provider.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe('electrical');
  });

  it('respects the radius the provider chose during onboarding', async () => {
    const customer = await createCustomer();
    const provider = await createBareProvider({ verification: 'VERIFIED' });
    // Works a 2km radius, and sits 4km from this customer.
    await onboard(provider.id, { radiusKm: 2, lat: 32.11, lon: 34.7749 });
    await goOnline(provider.id, 32.11, 34.7749);

    const jobId = await createJob({ customerId: customer.id, ...LOC });
    const outcome = await runDispatchWave(jobId);
    expect(outcome.offersCreated).toBe(0);
  });
});
