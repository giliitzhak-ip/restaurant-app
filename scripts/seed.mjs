#!/usr/bin/env node
/**
 * Deterministic development seed (spec §61).
 *
 * Everything here is tagged is_demo = true and uses fixed UUIDs, so running
 * it repeatedly converges on the same state and demo rows can never be
 * confused with real ones (spec §59).
 *
 * The provider layout is designed so ROUTE OPPORTUNITY is visibly decisive:
 * see ROUTE_DEMO below.
 */
import process from 'node:process';
import { randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://getservice:getservice@127.0.0.1:5432/getservice';

const DEMO_PASSWORD = 'demo1234';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

const log = (...a) => process.stdout.write(a.join(' ') + '\n');

// Reference point: Dizengoff Center, Tel Aviv.
const CUSTOMER_LAT = 32.0742;
const CUSTOMER_LON = 34.7749;

/**
 * ROUTE DEMO — the two rows that prove the product thesis (spec §15, §66).
 *
 *   ram-on-the-way : 3.2 km NORTH of the customer, heading due SOUTH, with a
 *                    destination SOUTH of the customer. It is already going
 *                    there; picking it up costs almost no detour.
 *   dan-driving-away: 1.0 km NORTH of the customer — much closer — but
 *                    heading due NORTH with a destination 14 km further
 *                    north. Serving this job means turning around.
 *
 * A distance-only matcher picks dan. GET SERVICE must pick ram.
 */
const ROUTE_DEMO = ['ram-on-the-way', 'dan-driving-away'];

/** id suffix, name, category, lat, lon, heading, state, rating, ratingCount,
 *  completed, cancelled, years, price multiplier, destination [lat,lon]|null */
const PROVIDERS = [
  // ── The route-opportunity pair (both plumbers, comparable trust) ────────
  ['ram-on-the-way',   'רם אביטן',    'plumbing', 32.1030, 34.7749, 180, 'ONLINE', 4.8, 156, 210, 6,  9, 1.00, [32.0560, 34.7749]],
  ['dan-driving-away', 'דן מזרחי',    'plumbing', 32.0832, 34.7749,   0, 'ONLINE', 4.9, 203, 280, 7, 12, 0.97, [32.2100, 34.7900]],

  // ── Plumbing ───────────────────────────────────────────────────────────
  ['yossi-levi',    'יוסי לוי',      'plumbing', 32.0690, 34.7810, 300, 'ONLINE', 4.9, 341, 402, 9, 14, 1.02, [32.0650, 34.7700]],
  ['avi-shalom',    'אבי שלום',      'plumbing', 32.0500, 34.7620,  45, 'ONLINE', 4.4,  62,  88, 9,  5, 0.92, null],
  ['nadav-bar',     'נדב בר',        'plumbing', 32.1450, 34.8300, 225, 'ONLINE', 4.6, 118, 149, 4,  8, 1.05, [32.0900, 34.7800]],
  ['eli-ofek',      'אלי אופק',      'plumbing', 32.0250, 34.7450,   0, 'OFFLINE',4.7,  95, 121, 3, 11, 1.00, null],

  // ── Electrical ─────────────────────────────────────────────────────────
  ['tomer-gal',     'תומר גל',       'electrical', 32.0810, 34.7700, 190, 'ONLINE', 4.9, 276, 330, 5, 16, 1.00, [32.0600, 34.7750]],
  ['itai-ron',      'איתי רון',      'electrical', 32.0660, 34.7900, 280, 'ONLINE', 4.5,  88, 112, 8,  6, 0.94, null],
  ['shaul-adler',   'שאול אדלר',     'electrical', 32.1180, 34.8050, 200, 'ONLINE', 4.7, 143, 178, 6, 10, 1.08, [32.0700, 34.7800]],
  ['rami-dahan',    'רמי דהן',       'electrical', 32.0400, 34.7550,  10, 'BUSY',   4.8, 191, 233, 4, 13, 1.01, [32.0900, 34.7850]],

  // ── Air conditioning ───────────────────────────────────────────────────
  ['guy-neeman',    'גיא נאמן',      'air_conditioning', 32.0770, 34.7830, 250, 'ONLINE', 4.8, 164, 198, 5, 11, 1.00, [32.0730, 34.7700]],
  ['oren-katz',     'אורן כץ',       'air_conditioning', 32.1320, 34.8420, 210, 'ONLINE', 4.6, 109, 137, 7,  9, 0.96, [32.0800, 34.7900]],
  ['maor-siso',     'מאור סיסו',     'air_conditioning', 32.0560, 34.7480,  20, 'ONLINE', 4.3,  47,  61, 6,  4, 0.90, null],

  // ── Locksmith ──────────────────────────────────────────────────────────
  ['kobi-mor',      'קובי מור',      'locksmith', 32.0725, 34.7790, 170, 'ONLINE', 4.9, 388, 455, 6, 15, 1.00, null],
  ['sagi-levin',    'שגיא לוין',     'locksmith', 32.0910, 34.7940, 200, 'ONLINE', 4.5,  76,  98, 5,  7, 1.06, [32.0700, 34.7760]],
  ['ziv-hadad',     'זיו חדד',       'locksmith', 32.0300, 34.7700,   0, 'ONLINE', 4.7, 132, 165, 4,  9, 0.95, null],

  // ── Pest control ───────────────────────────────────────────────────────
  ['noam-vaknin',   'נועם וקנין',    'pest_control', 32.0880, 34.7680, 195, 'ONLINE', 4.7, 121, 152, 5, 12, 1.00, [32.0650, 34.7720]],
  ['lior-azulay',   'ליאור אזולאי',  'pest_control', 32.1600, 34.8400, 220, 'ONLINE', 4.4,  58,  74, 6,  6, 0.93, null],

  // ── Cleaning ───────────────────────────────────────────────────────────
  ['dana-shapira',  'דנה שפירא',     'cleaning', 32.0800, 34.7720, 180, 'ONLINE', 4.9, 214, 256, 3, 10, 1.00, [32.0700, 34.7740]],
  ['orly-ben-ami',  'אורלי בן עמי',  'cleaning', 32.0450, 34.7600,  30, 'ONLINE', 4.6,  97, 124, 5,  8, 0.98, null],

  // ── Gardening ──────────────────────────────────────────────────────────
  ['amit-regev',    'עמית רגב',      'gardening', 32.1050, 34.8200, 215, 'ONLINE', 4.8, 143, 171, 4, 13, 1.00, [32.0780, 34.7800]],
  ['yaniv-peretz',  'יניב פרץ',      'gardening', 32.0200, 34.7800,   5, 'ONLINE', 4.5,  71,  92, 6,  7, 0.94, null],
];

const CUSTOMERS = [
  ['rotem',  'רותם אדרי',   '+972500000001', 32.0742, 34.7749],
  ['shira',  'שירה גולן',   '+972500000002', 32.0850, 34.7800],
  ['eitan',  'איתן קדם',    '+972500000003', 32.0600, 34.7700],
];

function uuidFor(kind, key) {
  // Deterministic, human-recognisable UUIDs so demo data is stable and
  // obviously synthetic.
  const base = kind === 'provider' ? 'aaaa' : kind === 'customer' ? 'bbbb' : 'cccc';
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 0xffffffff;
  const hex = h.toString(16).padStart(8, '0');
  return `${base}${hex.slice(0, 4)}-${hex.slice(4, 8)}-4000-8000-${base}${hex.slice(0, 8)}`;
}

const client = new pg.Client({ connectionString });

async function main() {
  await client.connect();
  await client.query('begin');

  const { rows: catRows } = await client.query('select id, slug from categories');
  const categoryBySlug = new Map(catRows.map((r) => [r.slug, r.id]));
  const { rows: svcRows } = await client.query(
    'select s.id, s.slug, s.category_id, s.base_price_ils from services s',
  );

  if (categoryBySlug.size === 0) {
    throw new Error('No categories found — run db:migrate first.');
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  const adminId = uuidFor('admin', 'admin');
  await upsertUser(adminId, 'admin@demo.local', '+972500000900', 'admin', 'מנהל מערכת');

  // ── Customers ───────────────────────────────────────────────────────────
  const customerIds = {};
  for (const [key, name, phone, lat, lon] of CUSTOMERS) {
    const id = uuidFor('customer', key);
    customerIds[key] = id;
    await upsertUser(id, `${key}@demo.local`, phone, 'customer', name);
    await client.query(
      `insert into customer_profiles (id, default_address, default_location)
       values ($1, $2, st_point($4, $3)::geography)
       on conflict (id) do update set default_location = excluded.default_location`,
      [id, 'תל אביב', lat, lon],
    );
  }

  // ── Providers ───────────────────────────────────────────────────────────
  let providerCount = 0;
  for (const p of PROVIDERS) {
    const [key, name, catSlug, lat, lon, heading, state, rating, ratingCount,
           completed, cancelled, years, priceMult, destination] = p;
    const id = uuidFor('provider', key);
    const categoryId = categoryBySlug.get(catSlug);
    if (!categoryId) throw new Error(`Unknown category ${catSlug}`);

    await upsertUser(id, `${key}@demo.local`, null, 'provider', name);

    await client.query(
      `insert into provider_profiles
         (id, business_name, bio, years_experience, verification, verified_at,
          state, rating_avg, rating_count, completed_jobs, cancelled_jobs,
          offers_received, offers_accepted, avg_response_seconds,
          max_radius_km, is_demo)
       values ($1,$2,$3,$4,'VERIFIED',now(),$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
       on conflict (id) do update set
         state = excluded.state,
         rating_avg = excluded.rating_avg,
         rating_count = excluded.rating_count,
         completed_jobs = excluded.completed_jobs,
         cancelled_jobs = excluded.cancelled_jobs,
         verification = 'VERIFIED'`,
      [
        id, `${name} — שירותי ${catSlug}`, 'בעל מקצוע מנוסה באזור המרכז.', years,
        state, rating, ratingCount, completed, cancelled,
        completed + cancelled + 20, completed, 18 + (completed % 25),
        catSlug === 'pest_control' || catSlug === 'gardening' ? 30 : 18,
      ],
    );

    await client.query(
      `insert into provider_categories (provider_id, category_id, skills, is_primary)
       values ($1,$2,$3,true) on conflict do nothing`,
      [id, categoryId, [catSlug === 'air_conditioning' ? 'hvac' : catSlug]],
    );

    // Price every service in the provider's category, scaled by their multiplier.
    for (const svc of svcRows.filter((s) => s.category_id === categoryId)) {
      const base = Number(svc.base_price_ils ?? 300);
      await client.query(
        `insert into provider_services (provider_id, service_id, price_ils, is_active)
         values ($1,$2,$3,true)
         on conflict (provider_id, service_id) do update set price_ils = excluded.price_ils`,
        [id, svc.id, Math.round(base * priceMult)],
      );
    }

    // Live location. OFFLINE providers get a deliberately stale fix so the
    // staleness filter is exercised by the seed itself.
    const ageSeconds = state === 'OFFLINE' ? 3600 : 15;
    await client.query(
      `insert into provider_locations
         (provider_id, location, heading_deg, speed_kmh, accuracy_m,
          destination, recorded_at)
       values ($1, st_point($3,$2)::geography, $4, $5, 12,
               case when $6::double precision is null then null
                    else st_point($7,$6)::geography end,
               now() - make_interval(secs => $8))
       on conflict (provider_id) do update set
         location = excluded.location,
         heading_deg = excluded.heading_deg,
         speed_kmh = excluded.speed_kmh,
         destination = excluded.destination,
         recorded_at = excluded.recorded_at`,
      [
        id, lat, lon, heading,
        state === 'ONLINE' ? 34 : 0,
        destination ? destination[0] : null,
        destination ? destination[1] : null,
        ageSeconds,
      ],
    );

    await client.query(
      `insert into service_areas (provider_id, label, center, radius_km, is_active)
       select $1, 'אזור עבודה ראשי', st_point($3,$2)::geography, $4, true
       where not exists (select 1 from service_areas where provider_id = $1)`,
      [id, lat, lon, 25],
    );

    await client.query(
      `insert into provider_payout_details (provider_id, method, details)
       values ($1,'bank_transfer', $2::jsonb)
       on conflict (provider_id) do nothing`,
      [id, JSON.stringify({ bank: '12', branch: '345', account: `demo-${key}` })],
    );

    providerCount += 1;
  }

  // ── A few historical jobs so the admin tower is not empty ──────────────
  const plumbingCat = categoryBySlug.get('plumbing');
  const sinkLeak = svcRows.find((s) => s.slug === 'sink_leak');
  const completedJobId = 'dddddddd-0001-4000-8000-dddddddddddd';
  await client.query(
    `insert into jobs (id, customer_id, raw_description, category_id, service_id,
                       urgency, booking_mode, status, location, address_text,
                       quoted_price_ils, final_price_ils, is_demo, search_started_at, matched_at)
     values ($1,$2,$3,$4,$5,'high','NOW','COMPLETED',
             st_point($7,$6)::geography,'דיזנגוף 50, תל אביב',290,290,true,
             now() - interval '2 hours', now() - interval '110 minutes')
     on conflict (id) do nothing`,
    [completedJobId, customerIds.eitan, 'נזילה מתחת לכיור במטבח',
     plumbingCat, sinkLeak?.id ?? null, 32.06, 34.77],
  );

  await client.query('commit');

  log(`✅ seed complete`);
  log(`   ${providerCount} providers, ${CUSTOMERS.length} customers, 1 admin`);
  log(`   demo password for every account: ${DEMO_PASSWORD}`);
  log(`   route-opportunity pair: ${ROUTE_DEMO.join(' vs ')}`);
  log(`   customer reference point: ${CUSTOMER_LAT}, ${CUSTOMER_LON}`);
}

async function upsertUser(id, email, phone, role, fullName) {
  await client.query(
    `insert into auth.users (id, email, phone, encrypted_password)
     values ($1,$2,$3,$4)
     on conflict (id) do update set email = excluded.email`,
    [id, email, phone, hashPassword(DEMO_PASSWORD)],
  );
  await client.query(
    `insert into profiles (id, role, full_name, phone, email, is_demo)
     values ($1,$2,$3,$4,$5,true)
     on conflict (id) do update set full_name = excluded.full_name, role = excluded.role`,
    [id, role, fullName, phone, email],
  );
}

main()
  .catch((error) => {
    process.stderr.write(`\n❌ seed failed: ${error.message}\n`);
    return client.query('rollback').catch(() => {}).then(() => {
      process.exitCode = 1;
    });
  })
  .finally(() => client.end());
