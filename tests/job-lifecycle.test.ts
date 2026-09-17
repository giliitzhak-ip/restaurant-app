import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, JobStatus, NearbyProviderRow } from '@/types/database';
import { broadcastJob, discoverProviders } from '@/lib/services/matching/discovery';
import { canActorTransition } from '@/lib/services/jobs/workflow';
import { capturePaymentForJob, createPaymentForJob } from '@/lib/services/payments/flow';
import { calculateFee } from '@/lib/services/fees';
import { MockPaymentAdapter, setPaymentAdapter } from '@/lib/services/payments';
import { SETTINGS_DEFAULTS } from '@/lib/services/settings/schema';
import { asClient, FakeSupabase } from './helpers/fake-supabase';

const JOB = {
  id: 'job-1',
  customer_id: 'customer-1',
  category_id: 'cat-plumbing',
  service_id: 'svc-leak',
  lat: 32.0853,
  lng: 34.7818,
  urgency: 'now' as const,
  budget_min: 200,
  budget_max: 800,
};

/** Providers the SQL discovery function would return, at a given radius. */
function nearby(radiusKm: number): NearbyProviderRow[] {
  const pool: NearbyProviderRow[] = [
    {
      provider_id: 'p-near',
      user_id: 'u-near',
      business_name: 'א.ב. אינסטלציה',
      owner_name: 'אבי',
      avatar_url: null,
      bio: null,
      years_experience: 12,
      base_price: 350,
      rating_avg: 4.8,
      rating_count: 40,
      completed_jobs: 60,
      cancelled_jobs: 1,
      avg_response_seconds: 240,
      is_available: true,
      location_age_seconds: 120,
      distance_km: 1.8,
      serves_area: true,
      matches_service: true,
    },
    {
      provider_id: 'p-mid',
      user_id: 'u-mid',
      business_name: 'שלמה שרברבות',
      owner_name: 'שלמה',
      avatar_url: null,
      bio: null,
      years_experience: 5,
      base_price: 400,
      rating_avg: 4.2,
      rating_count: 12,
      completed_jobs: 18,
      cancelled_jobs: 0,
      avg_response_seconds: 600,
      is_available: true,
      location_age_seconds: 900,
      distance_km: 4.2,
      serves_area: true,
      matches_service: true,
    },
    {
      provider_id: 'p-far',
      user_id: 'u-far',
      business_name: 'פרו אינסטלציה',
      owner_name: 'דני',
      avatar_url: null,
      bio: null,
      years_experience: 20,
      base_price: 500,
      rating_avg: 4.9,
      rating_count: 90,
      completed_jobs: 150,
      cancelled_jobs: 2,
      avg_response_seconds: 180,
      is_available: true,
      location_age_seconds: 60,
      distance_km: 12.5,
      serves_area: false,
      matches_service: true,
    },
  ];

  return pool.filter((provider) => provider.distance_km <= radiusKm || provider.serves_area);
}

function newClient(radiusResponder = nearby) {
  const fake = new FakeSupabase(
    {
      jobs: [{ ...JOB, status: 'requested', title: 'נזילה במטבח', search_radius_km: 5 }],
      job_assignments: [],
      job_offers: [],
      favorites: [],
      payments: [],
      payment_transactions: [],
      platform_fees: [],
      reviews: [],
    },
    {
      find_nearby_providers: (args) => radiusResponder(Number(args.radius_km)),
    },
  );
  return { fake, db: asClient<SupabaseClient<Database>>(fake) };
}

describe('full job lifecycle', () => {
  beforeEach(() => {
    setPaymentAdapter(new MockPaymentAdapter());
  });

  it('runs request → broadcast → offer → accept → progress → complete → review', async () => {
    const { fake, db } = newClient();

    /* 1. Discovery: the match engine shortlists providers for the new job. */
    const discovery = await discoverProviders(JOB, db);
    expect(discovery.shortlist.length).toBeGreaterThanOrEqual(
      SETTINGS_DEFAULTS.matching.minimum_providers,
    );
    // The nearest strong provider should come out on top.
    expect(discovery.shortlist[0].candidate.providerId).toBe('p-near');

    /* 2. Broadcast: writing job_assignments is what grants providers access. */
    const notified = await broadcastJob(JOB.id, discovery, db);
    expect(notified).toContain('u-near');
    expect(fake.table('job_assignments')).toHaveLength(discovery.shortlist.length);
    expect(fake.table('jobs')[0].status).toBe('searching');

    /* 3. A provider quotes. */
    await db.from('job_offers').insert({
      id: 'offer-1',
      job_id: JOB.id,
      provider_id: 'p-near',
      price: 600,
      eta_minutes: 25,
      status: 'pending',
      valid_until: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await db.from('jobs').update({ status: 'offers_received' }).eq('id', JOB.id);

    /* 4. The customer accepts: payment is authorised for the offered amount. */
    const { breakdown } = await createPaymentForJob(db, {
      jobId: JOB.id,
      customerId: JOB.customer_id,
      providerId: 'p-near',
      amount: 600,
      description: 'נזילה במטבח',
    });

    expect(breakdown.amount).toBe(600);
    expect(breakdown.platformFee).toBe(90); // 15% tier
    expect(breakdown.providerPayout).toBe(510);

    await db
      .from('jobs')
      .update({
        status: 'provider_selected',
        assigned_provider_id: 'p-near',
        accepted_offer_id: 'offer-1',
        final_price: breakdown.amount,
        platform_fee: breakdown.platformFee,
        provider_payout: breakdown.providerPayout,
      })
      .eq('id', JOB.id);
    await db.from('job_offers').update({ status: 'accepted' }).eq('id', 'offer-1');

    /* 5. The provider walks the job forward — each hop must be legal. */
    const progression: JobStatus[] = ['provider_on_the_way', 'arrived', 'in_progress'];
    let current: JobStatus = 'provider_selected';

    for (const nextStatus of progression) {
      expect(canActorTransition(current, nextStatus, 'provider')).toBe(true);
      await db.from('jobs').update({ status: nextStatus }).eq('id', JOB.id);
      current = nextStatus;
    }
    expect(fake.table('jobs')[0].status).toBe('in_progress');

    /* 6. Completion captures the held funds and books the commission. */
    expect(canActorTransition(current, 'completed', 'provider')).toBe(true);
    const captured = await capturePaymentForJob(db, JOB.id);
    await db
      .from('jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', JOB.id);

    expect(captured?.payment.status).toBe('captured');
    expect(fake.table('platform_fees')).toHaveLength(1);
    expect(fake.table('platform_fees')[0].amount).toBe(90);

    /* 7. The customer reviews the completed job. */
    await db.from('reviews').insert({
      job_id: JOB.id,
      customer_id: JOB.customer_id,
      provider_id: 'p-near',
      rating: 5,
      comment: 'עבודה מצוינת',
    });

    expect(fake.table('reviews')).toHaveLength(1);
    expect(fake.table('jobs')[0].status).toBe('completed');

    /* The money adds up: what the customer paid equals fee + payout. */
    const payment = fake.table('payments')[0];
    expect(Number(payment.platform_fee) + Number(payment.provider_payout)).toBeCloseTo(
      Number(payment.amount),
      2,
    );
  });

  it('widens the search radius until enough providers are found', async () => {
    // Only the distant provider exists, and it does not declare a service area.
    const sparse = (radiusKm: number) =>
      nearby(999)
        .filter((provider) => provider.provider_id === 'p-far')
        .map((provider) => ({ ...provider, serves_area: false }))
        .filter((provider) => provider.distance_km <= radiusKm);

    const { fake, db } = newClient(sparse);
    const discovery = await discoverProviders(JOB, db);

    const radiiTried = fake.rpcCalls.map((call) => Number(call.args.radius_km));
    expect(radiiTried).toEqual([5, 10, 20]);
    expect(discovery.radiusKm).toBe(20);
    expect(discovery.exhausted).toBe(true);
    expect(discovery.shortlist).toHaveLength(1);
  });

  it('reports an empty shortlist rather than failing when nobody is nearby', async () => {
    const { db } = newClient(() => []);
    const discovery = await discoverProviders(JOB, db);

    expect(discovery.shortlist).toHaveLength(0);
    expect(discovery.exhausted).toBe(true);

    const notified = await broadcastJob(JOB.id, discovery, db);
    expect(notified).toEqual([]);
  });

  it('records the fee rule that was in force with the payment', async () => {
    const { fake, db } = newClient();

    await createPaymentForJob(db, {
      jobId: JOB.id,
      customerId: JOB.customer_id,
      providerId: 'p-near',
      amount: 1500,
      description: 'job',
    });

    const snapshot = fake.table('payments')[0].fee_rule_snapshot as {
      rule: { source: string; percentage: number };
    };
    expect(snapshot.rule.source).toBe('tier');
    expect(snapshot.rule.percentage).toBe(0.1);
    // And it matches what the pure calculator says for the same amount.
    expect(calculateFee(1500, SETTINGS_DEFAULTS.platform_fee_rules).platformFee).toBe(150);
  });
});
