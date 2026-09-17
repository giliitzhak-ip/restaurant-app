/**
 * GET SERVICE — development seed.
 *
 * Creates a realistic demo dataset: customers, providers spread across Israeli
 * cities, jobs in every lifecycle state, offers, payments and reviews.
 *
 * Run with:  npm run db:seed
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and that the
 * migrations have already been applied.
 *
 * It is idempotent for the fixed test accounts (they are reused) and additive
 * for generated data.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database, JobStatus } from '../../types/database';
import {
  BUSINESS_PREFIXES,
  CITIES,
  CUSTOMER_NAMES,
  JOB_TEMPLATES,
  OFFER_NOTES,
  OWNER_NAMES,
  REVIEW_COMMENTS,
  STREETS,
} from './data';

config({ path: '.env.local' });
config({ path: '.env' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    '\n  חסרים משתני סביבה.\n' +
      '  נדרשים NEXT_PUBLIC_SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY ב-.env.local\n',
  );
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Demo passwords only. Never use these outside a throwaway project — the whole
 * point of keeping them here is that they are obviously not production values.
 */
const DEMO_PASSWORD = 'DemoPassword123!';

/** Deterministic PRNG so repeated runs produce the same shape of data. */
let seed = 42;
function random(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
const range = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
/** Jitters a city centre by up to ~2 km so points are not stacked. */
const jitter = (value: number) => value + (random() - 0.5) * 0.04;

async function ensureUser(
  email: string,
  role: 'customer' | 'provider' | 'admin',
  fullName: string,
  phone: string,
): Promise<string | null> {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: role === 'admin' ? 'customer' : role },
  });

  let userId = created?.user?.id ?? null;

  if (error) {
    // Already exists — find it so the run stays idempotent.
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((user) => user.email === email)?.id ?? null;
    if (!userId) {
      console.error(`  ✗ ${email}: ${error.message}`);
      return null;
    }
  }

  if (!userId) return null;

  // The handle_new_user trigger creates the rows; admin is promoted here,
  // because signup metadata is deliberately not allowed to grant that role.
  await supabase.from('users').update({ role, phone }).eq('id', userId);
  await supabase.from('profiles').update({ full_name: fullName, phone }).eq('user_id', userId);

  if (role === 'admin') {
    await supabase.from('provider_profiles').delete().eq('user_id', userId);
  }

  return userId;
}

async function main() {
  console.log('\n🌱 GET SERVICE — seeding demo data\n');

  const { data: categories } = await supabase.from('categories').select('id, slug, name');
  const { data: services } = await supabase.from('services').select('id, slug, category_id');

  if (!categories?.length) {
    console.error('  ✗ אין קטגוריות. הרץ קודם את המיגרציות (supabase db push / db reset).');
    process.exit(1);
  }
  console.log(`  ✓ ${categories.length} קטגוריות, ${services?.length ?? 0} שירותים`);

  /* ── Fixed demo accounts ────────────────────────────────────────────────── */
  const adminId = await ensureUser('admin@test.com', 'admin', 'מנהל מערכת', '0500000001');
  const demoCustomerId = await ensureUser('customer@test.com', 'customer', 'לקוח לדוגמה', '0500000002');
  const demoProviderId = await ensureUser('provider@test.com', 'provider', 'בעל מקצוע לדוגמה', '0500000003');
  console.log(`  ✓ חשבונות הדגמה: admin/customer/provider@test.com (סיסמה: ${DEMO_PASSWORD})`);

  /* ── Customers ──────────────────────────────────────────────────────────── */
  const customerIds: string[] = demoCustomerId ? [demoCustomerId] : [];

  for (let i = 0; i < CUSTOMER_NAMES.length; i += 1) {
    const city = CITIES[i % CITIES.length];
    const id = await ensureUser(
      `customer${i + 1}@demo.getservice.local`,
      'customer',
      CUSTOMER_NAMES[i],
      `05${range(10, 89)}${String(range(100000, 999999))}`,
    );
    if (!id) continue;
    customerIds.push(id);

    await supabase
      .from('customer_profiles')
      .update({
        default_address: `${pick(STREETS)} ${range(1, 90)}, ${city.name}`,
        default_lat: jitter(city.lat),
        default_lng: jitter(city.lng),
      })
      .eq('user_id', id);
  }
  console.log(`  ✓ ${customerIds.length} לקוחות`);

  /* ── Providers ──────────────────────────────────────────────────────────── */
  const providerIds: string[] = [];

  for (let i = 0; i < OWNER_NAMES.length; i += 1) {
    const city = CITIES[i % CITIES.length];
    const category = categories[i % categories.length];
    const businessName = `${pick(BUSINESS_PREFIXES)} ${category.name}`;
    const phone = `05${range(10, 89)}${String(range(100000, 999999))}`;

    const userId =
      i === 0 && demoProviderId
        ? demoProviderId
        : await ensureUser(
            `provider${i + 1}@demo.getservice.local`,
            'provider',
            OWNER_NAMES[i],
            phone,
          );

    if (!userId) continue;

    // 17 of 20 verified, 2 pending, 1 rejected — enough to exercise the admin queue.
    const status = i < 17 ? 'verified' : i < 19 ? 'pending' : 'rejected';

    const { data: provider } = await supabase
      .from('provider_profiles')
      .upsert(
        {
          user_id: userId,
          business_name: businessName,
          owner_name: OWNER_NAMES[i],
          phone,
          email: `provider${i + 1}@demo.getservice.local`,
          bio: `${businessName} — ${range(3, 25)} שנות ניסיון באזור ${city.name} והסביבה. עבודה נקייה, מחיר הוגן ואחריות מלאה.`,
          years_experience: range(3, 25),
          base_price: range(3, 12) * 50,
          status,
          onboarding_completed: true,
          onboarding_step: 9,
          terms_accepted_at: new Date().toISOString(),
          verified_at: status === 'verified' ? new Date().toISOString() : null,
        },
        { onConflict: 'user_id' },
      )
      .select('id')
      .single();

    if (!provider) continue;
    providerIds.push(provider.id);

    // Each provider covers their primary category plus one neighbour.
    const secondary = categories[(i + 3) % categories.length];
    await supabase.from('provider_categories').upsert(
      [
        { provider_id: provider.id, category_id: category.id },
        { provider_id: provider.id, category_id: secondary.id },
      ],
      { onConflict: 'provider_id,category_id', ignoreDuplicates: true },
    );

    const ownServices = (services ?? []).filter(
      (service) => service.category_id === category.id,
    );
    if (ownServices.length) {
      await supabase.from('provider_services').upsert(
        ownServices.map((service) => ({
          provider_id: provider.id,
          service_id: service.id,
          price_from: range(2, 10) * 50,
        })),
        { onConflict: 'provider_id,service_id', ignoreDuplicates: true },
      );
    }

    await supabase.from('service_areas').insert({
      provider_id: provider.id,
      label: city.name,
      center_lat: jitter(city.lat),
      center_lng: jitter(city.lng),
      radius_km: range(10, 30),
    });

    const isAvailable = status === 'verified' && random() > 0.35;
    await supabase
      .from('provider_availability')
      .upsert({ provider_id: provider.id, is_available: isAvailable }, { onConflict: 'provider_id' });

    if (isAvailable) {
      await supabase.from('provider_locations').upsert(
        {
          provider_id: provider.id,
          lat: jitter(city.lat),
          lng: jitter(city.lng),
          accuracy_m: range(5, 40),
          updated_at: new Date(Date.now() - range(0, 9) * 60_000).toISOString(),
        },
        { onConflict: 'provider_id' },
      );
    }

    await supabase.from('provider_documents').insert([
      {
        provider_id: provider.id,
        doc_type: 'identity',
        storage_path: `${userId}/demo-identity.pdf`,
        file_name: 'תעודת זהות.pdf',
        status: status === 'verified' ? 'approved' : 'pending',
      },
      {
        provider_id: provider.id,
        doc_type: 'insurance',
        storage_path: `${userId}/demo-insurance.pdf`,
        file_name: 'ביטוח צד ג.pdf',
        status: status === 'verified' ? 'approved' : 'pending',
      },
    ]);
  }
  console.log(`  ✓ ${providerIds.length} בעלי מקצוע`);

  /* ── Jobs, offers, payments, reviews ────────────────────────────────────── */
  const statusPlan: JobStatus[] = [
    ...Array<JobStatus>(18).fill('completed'),
    ...Array<JobStatus>(8).fill('offers_received'),
    ...Array<JobStatus>(6).fill('searching'),
    ...Array<JobStatus>(5).fill('in_progress'),
    ...Array<JobStatus>(4).fill('provider_on_the_way'),
    ...Array<JobStatus>(4).fill('provider_selected'),
    ...Array<JobStatus>(3).fill('arrived'),
    ...Array<JobStatus>(2).fill('cancelled'),
  ];

  let offerCount = 0;
  let reviewCount = 0;
  let paymentCount = 0;

  const verifiedProviders = providerIds.slice(0, 17);

  for (let i = 0; i < statusPlan.length; i += 1) {
    const status = statusPlan[i];
    const customerId = customerIds[i % customerIds.length];
    const city = CITIES[i % CITIES.length];
    const category = categories[i % categories.length];
    const templates = JOB_TEMPLATES[category.slug] ?? JOB_TEMPLATES.other;
    const template = templates[i % templates.length];
    const service = (services ?? []).find((entry) => entry.category_id === category.id) ?? null;

    const createdAt = new Date(Date.now() - range(1, 60) * 24 * 60 * 60 * 1000).toISOString();
    const budgetMin = range(2, 8) * 100;

    const { data: job } = await supabase
      .from('jobs')
      .insert({
        customer_id: customerId,
        category_id: category.id,
        service_id: service?.id ?? null,
        title: template.title,
        description: template.description,
        status: 'requested',
        urgency: pick(['now', 'today', 'today', 'tomorrow'] as const),
        address: `${pick(STREETS)} ${range(1, 90)}, ${city.name}`,
        lat: jitter(city.lat),
        lng: jitter(city.lng),
        budget_min: budgetMin,
        budget_max: budgetMin + range(2, 6) * 100,
        created_at: createdAt,
        broadcast_at: createdAt,
      })
      .select('id, title')
      .single();

    if (!job) continue;

    // Broadcast to a handful of providers, as the match engine would.
    const shortlist = verifiedProviders
      .slice((i * 3) % Math.max(1, verifiedProviders.length - 4), ((i * 3) % Math.max(1, verifiedProviders.length - 4)) + 4)
      .filter(Boolean);

    if (shortlist.length) {
      await supabase.from('job_assignments').upsert(
        shortlist.map((providerId, index) => ({
          job_id: job.id,
          provider_id: providerId,
          match_score: 90 - index * range(3, 9),
          distance_km: range(1, 18) + random(),
          notified_at: createdAt,
        })),
        { onConflict: 'job_id,provider_id', ignoreDuplicates: true },
      );
    }

    if (status === 'searching' || status === 'requested') {
      await supabase.from('jobs').update({ status: 'searching' }).eq('id', job.id);
      continue;
    }

    // Offers
    const offerProviders = shortlist.slice(0, range(2, Math.max(2, shortlist.length)));
    const offers: Array<{ providerId: string; price: number }> = [];

    for (const providerId of offerProviders) {
      const price = budgetMin + range(-1, 4) * 50;
      const { data: offer } = await supabase
        .from('job_offers')
        .insert({
          job_id: job.id,
          provider_id: providerId,
          price: Math.max(80, price),
          eta_minutes: range(15, 180),
          note: pick(OFFER_NOTES),
          distance_km: range(1, 18) + random(),
          valid_until: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single();

      if (offer) {
        offers.push({ providerId, price: Math.max(80, price) });
        offerCount += 1;
      }
    }

    if (status === 'offers_received' || !offers.length) {
      await supabase.from('jobs').update({ status: 'offers_received' }).eq('id', job.id);
      continue;
    }

    // Accept the cheapest offer, then take the job to its planned state.
    const accepted = offers.reduce((best, offer) => (offer.price < best.price ? offer : best));
    const { data: acceptedOffer } = await supabase
      .from('job_offers')
      .update({ status: 'accepted' })
      .eq('job_id', job.id)
      .eq('provider_id', accepted.providerId)
      .select('id')
      .single();

    await supabase
      .from('job_offers')
      .update({ status: 'rejected' })
      .eq('job_id', job.id)
      .neq('provider_id', accepted.providerId);

    const rate = accepted.price >= 1000 ? 0.1 : 0.15;
    const fee = Math.max(15, Math.round(accepted.price * rate * 100) / 100);
    const payout = Math.round((accepted.price - fee) * 100) / 100;

    await supabase
      .from('jobs')
      .update({
        status: status === 'cancelled' ? 'cancelled' : status,
        assigned_provider_id: accepted.providerId,
        accepted_offer_id: acceptedOffer?.id ?? null,
        final_price: accepted.price,
        platform_fee: fee,
        provider_payout: payout,
        ...(status === 'completed'
          ? { completed_at: new Date(Date.parse(createdAt) + 3 * 60 * 60 * 1000).toISOString() }
          : {}),
        ...(status === 'cancelled'
          ? {
              cancelled_by: 'customer' as const,
              cancellation_reason: 'נמצא פתרון אחר בינתיים',
              cancelled_at: new Date().toISOString(),
            }
          : {}),
      })
      .eq('id', job.id);

    if (status !== 'cancelled') {
      const { data: payment } = await supabase
        .from('payments')
        .insert({
          job_id: job.id,
          customer_id: customerId,
          provider_id: accepted.providerId,
          amount: accepted.price,
          platform_fee: fee,
          provider_payout: payout,
          status: status === 'completed' ? 'captured' : 'authorized',
          provider_name: 'mock',
          external_id: `mock_auth_seed_${i}`,
          fee_rule_snapshot: { rate, source: 'seed' },
          authorized_at: createdAt,
          captured_at: status === 'completed' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();

      if (payment) {
        paymentCount += 1;
        if (status === 'completed') {
          await supabase.from('platform_fees').insert({
            payment_id: payment.id,
            job_id: job.id,
            amount: fee,
            rate,
            rule_label: accepted.price >= 1000 ? '₪1,000 ומעלה' : 'עד ₪999',
          });
        }
      }
    }

    // Chat on every assigned job, so the inbox is not empty.
    const { data: providerUser } = await supabase
      .from('provider_profiles')
      .select('user_id')
      .eq('id', accepted.providerId)
      .maybeSingle();

    if (providerUser) {
      await supabase.from('messages').insert([
        {
          job_id: job.id,
          sender_id: customerId,
          body: 'היי, מתי אפשר להגיע?',
          message_type: 'text',
        },
        {
          job_id: job.id,
          sender_id: providerUser.user_id,
          body: 'שלום! אני בדרך, אעדכן כשאצא.',
          message_type: 'text',
        },
      ]);
    }

    if (status === 'completed') {
      const rating = pick([5, 5, 5, 4, 4, 3]);
      const { data: review } = await supabase
        .from('reviews')
        .insert({
          job_id: job.id,
          customer_id: customerId,
          provider_id: accepted.providerId,
          rating,
          comment: pick(REVIEW_COMMENTS),
        })
        .select('id')
        .single();

      if (review) {
        reviewCount += 1;
        await supabase.from('review_categories').insert(
          (['professionalism', 'price', 'punctuality', 'service'] as const).map((criterion) => ({
            review_id: review.id,
            criterion,
            score: Math.max(1, Math.min(5, rating + range(-1, 1))),
          })),
        );
      }
    }
  }

  console.log(`  ✓ ${statusPlan.length} עבודות`);
  console.log(`  ✓ ${offerCount} הצעות מחיר`);
  console.log(`  ✓ ${paymentCount} עסקאות`);
  console.log(`  ✓ ${reviewCount} דירוגים`);

  // A couple of open disputes so the admin queue is not empty.
  const { data: completedJobs } = await supabase
    .from('jobs')
    .select('id, customer_id')
    .eq('status', 'completed')
    .limit(2);

  for (const job of completedJobs ?? []) {
    await supabase.from('disputes').insert({
      job_id: job.id,
      opened_by: job.customer_id,
      opened_by_type: 'customer',
      reason: 'price',
      description: 'המחיר הסופי היה גבוה ממה שסוכם מראש.',
      status: 'open',
    });
  }

  if (adminId) {
    console.log('\n  משתמשי הדגמה:');
    console.log(`    admin@test.com    / ${DEMO_PASSWORD}`);
    console.log(`    customer@test.com / ${DEMO_PASSWORD}`);
    console.log(`    provider@test.com / ${DEMO_PASSWORD}`);
  }

  console.log('\n✅ הזריעה הושלמה\n');
}

main().catch((error) => {
  console.error('\n✗ הזריעה נכשלה:', error);
  process.exit(1);
});
