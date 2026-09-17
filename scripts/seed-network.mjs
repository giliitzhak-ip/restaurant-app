#!/usr/bin/env node
/**
 * Seed a large synthetic provider network (spec §21–§31).
 *
 * SAFETY (spec §60): refuses to run against production unless explicitly
 * forced, and every row it writes is tagged is_demo = true so synthetic
 * professionals can never be silently mistaken for real ones.
 *
 *   npm run db:network                  # 1000 providers, seed 20260917
 *   COUNT=2500 SEED=7 npm run db:network
 *   npm run db:network -- --reset       # remove the synthetic network first
 *
 * Deterministic: the same SEED reproduces the same network exactly, so a
 * changed matching result means the code changed, not the fixtures.
 */
import process from 'node:process';
import pg from 'pg';
import {
  AVAILABILITY_SHAPES,
  createRandom,
  nameFor,
  reputationFor,
  scatter,
  scheduleFor,
  weightedCategory,
  weightedRegion,
} from './lib/synthetic.mjs';

const SEED = Number(process.env.SEED ?? 20260917);
const COUNT = Number(process.env.COUNT ?? 1000);
const RESET = process.argv.includes('--reset');
const FORCE = process.argv.includes('--force-production');

const connectionString =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgresql://getservice:getservice@127.0.0.1:5432/getservice';

const log = (...a) => process.stdout.write(a.join(' ') + '\n');

/* ── Production guard ───────────────────────────────────────────────────── */
function assertSafeEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  const demoMode = process.env.DEMO_MODE === 'true';

  if (isProduction && !FORCE) {
    throw new Error(
      'Refusing to seed synthetic providers with NODE_ENV=production. ' +
        'These are not real professionals (spec §60). Pass --force-production ' +
        'only if you genuinely intend to write demo data to a production database.',
    );
  }
  if (!demoMode && !isProduction) {
    log('⚠ DEMO_MODE is not "true"; seeding anyway because this is not production.');
  }
}

/** The demo marker every synthetic account carries, in its email. */
const TAG = 'gsnet';

async function main() {
  assertSafeEnvironment();

  if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 20000) {
    throw new Error(`COUNT must be between 1 and 20000, got ${COUNT}`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    if (RESET) {
      log('⟳ removing the existing synthetic network');
      await removeNetwork(client);
    }

    const { rows: catRows } = await client.query(
      'select id, slug, name_he, default_duration_min, default_radius_km, required_skills from categories where is_active',
    );
    if (catRows.length === 0) throw new Error('No categories found — run db:migrate first.');

    const { rows: svcRows } = await client.query(
      'select id, category_id, slug, base_price_ils, min_price_ils, max_price_ils, duration_min from services where is_active',
    );

    const categoryBySlug = new Map(catRows.map((c) => [c.slug, c]));
    const servicesByCategory = new Map();
    for (const s of svcRows) {
      if (!servicesByCategory.has(s.category_id)) servicesByCategory.set(s.category_id, []);
      servicesByCategory.get(s.category_id).push(s);
    }

    const random = createRandom(SEED);
    const generated = [];

    for (let index = 0; index < COUNT; index += 1) {
      generated.push(buildProvider(index, random, categoryBySlug, servicesByCategory));
    }

    log(`• generated ${generated.length} providers (seed ${SEED})`);

    await client.query('begin');
    await insertProviders(client, generated);
    await client.query('commit');

    const stats = await summarise(client);
    log('');
    log('✅ synthetic network seeded');
    for (const [label, value] of Object.entries(stats)) {
      log(`   ${label.padEnd(26)} ${value}`);
    }
    log('');
    log(`   Regenerate identically with: SEED=${SEED} COUNT=${COUNT} npm run db:network -- --reset`);
  } finally {
    await client.end();
  }
}

/* ── One provider ───────────────────────────────────────────────────────── */
function buildProvider(index, random, categoryBySlug, servicesByCategory) {
  const { fullName } = nameFor(random);
  const region = weightedRegion(random);
  const primarySlug = weightedCategory(random);
  const primary = categoryBySlug.get(primarySlug);
  if (!primary) throw new Error(`Category ${primarySlug} missing from the catalog`);

  // Some professionals genuinely work two adjacent trades (spec §23).
  const categories = [primary];
  if (random.chance(0.16)) {
    const adjacency = {
      plumbing: ['air_conditioning'],
      electrical: ['air_conditioning'],
      air_conditioning: ['electrical', 'plumbing'],
      cleaning: ['gardening'],
      gardening: ['cleaning'],
      locksmith: [],
      pest_control: ['cleaning'],
    };
    const options = (adjacency[primarySlug] ?? []).map((s) => categoryBySlug.get(s)).filter(Boolean);
    if (options.length > 0) categories.push(random.pick(options));
  }

  const reputation = reputationFor(random);
  const shape = random.weighted(AVAILABILITY_SHAPES);

  // Verification: a real network has unverified and suspended accounts too,
  // and they must be excluded from matching rather than absent from the data.
  const verification = reputation.tier === 'new'
    ? random.weighted([['VERIFIED', 6], ['PENDING', 4]])
    : random.weighted([['VERIFIED', 92], ['PENDING', 4], ['SUSPENDED', 2], ['REJECTED', 2]]);

  const realtimeState =
    verification !== 'VERIFIED'
      ? 'OFFLINE'
      : shape === 'busy'
        ? 'BUSY'
        : ['online_now', 'online_narrow', 'stale_location', 'temporary_today', 'no_schedule'].includes(shape)
          ? 'ONLINE'
          : random.weighted([['OFFLINE', 7], ['ONLINE', 3]]);

  const position = scatter(region, random);

  // Route-opportunity scenarios (spec §29): the destination is what turns
  // inferred direction into measured route deviation.
  const routeScenario = random.weighted([
    ['none', 52],
    ['toward_city', 20],       // heading to the locality centre
    ['away_from_city', 14],    // heading out
    ['crossing', 14],          // passing through
  ]);

  let heading = null;
  let destination = null;
  if (realtimeState !== 'OFFLINE' && routeScenario !== 'none') {
    const bearingTo = (from, to) => {
      const y = Math.sin(((to.lon - from.lon) * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180);
      const x =
        Math.cos((from.lat * Math.PI) / 180) * Math.sin((to.lat * Math.PI) / 180) -
        Math.sin((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) *
          Math.cos(((to.lon - from.lon) * Math.PI) / 180);
      return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    };

    if (routeScenario === 'toward_city') {
      destination = { lat: region.lat, lon: region.lon };
    } else if (routeScenario === 'away_from_city') {
      destination = {
        lat: position.lat + (position.lat - region.lat) * 2.5,
        lon: position.lon + (position.lon - region.lon) * 2.5,
      };
    } else {
      // Straight through the centre and out the other side.
      destination = {
        lat: region.lat + (region.lat - position.lat) * 1.2,
        lon: region.lon + (region.lon - position.lon) * 1.2,
      };
    }
    heading = Number(bearingTo(position, destination).toFixed(2));
  }

  const locationAgeSeconds =
    realtimeState === 'OFFLINE' ? null : shape === 'stale_location' ? random.int(400, 5400) : random.int(3, 90);

  // Pricing: a multiplier around the catalog guide, correlated with
  // reputation — strong providers charge a little more.
  const priceMultiplier = Number(
    random.gaussian(
      reputation.tier === 'excellent' ? 1.12 : reputation.tier === 'strong' ? 1.04 : reputation.tier === 'struggling' ? 0.88 : 0.98,
      0.12,
      0.72,
      1.45,
    ).toFixed(3),
  );

  const services = [];
  for (const category of categories) {
    const pool = servicesByCategory.get(category.id) ?? [];
    // Most providers do most of their category; few do all of it.
    const take = Math.max(1, Math.round(pool.length * random.float(0.5, 1.0)));
    for (const service of random.shuffle(pool).slice(0, take)) {
      const guide = Number(service.base_price_ils ?? 300);
      const min = service.min_price_ils ? Number(service.min_price_ils) : guide * 0.7;
      const max = service.max_price_ils ? Number(service.max_price_ils) : guide * 1.6;
      services.push({
        id: service.id,
        priceIls: Math.max(min, Math.min(max, Math.round((guide * priceMultiplier) / 5) * 5)),
        durationMin: service.duration_min ?? category.default_duration_min,
      });
    }
  }

  const radiusKm = Number(
    random.gaussian(
      region.density === 'urban' ? 12 : region.density === 'suburban' ? 20 : 35,
      region.density === 'periphery' ? 12 : 6,
      4,
      90,
    ).toFixed(1),
  );

  return {
    key: `${TAG}-${String(index).padStart(5, '0')}`,
    fullName,
    businessName: random.chance(0.55) ? `${fullName} — ${primary.name_he}` : null,
    bio: random.pick([
      'עובד באזור שנים, שירות מהיר ואמין.',
      'מתמחה בתקלות דחופות, זמין גם בשעות לא שגרתיות.',
      'עבודה נקייה עם אחריות על כל תיקון.',
      'ותק רב בתחום, מגיע עם כל הציוד הנדרש.',
      null,
    ]),
    region,
    categories,
    services,
    reputation,
    verification,
    realtimeState,
    shape,
    schedule: verification === 'VERIFIED' ? scheduleFor(shape, random) : [],
    overrides: buildOverrides(shape, random),
    position,
    heading,
    destination,
    locationAgeSeconds,
    radiusKm,
    routeScenario,
    responseSeconds:
      reputation.tier === 'new' ? null : random.int(8, 180),
  };
}

/** Vacations and one-off windows (spec §28). */
function buildOverrides(shape, random) {
  const out = [];
  const dayOffset = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  if (shape === 'on_vacation') {
    const span = random.int(3, 10);
    for (let i = 0; i < span; i += 1) out.push({ onDate: dayOffset(i), kind: 'unavailable', note: 'חופשה' });
  } else if (shape === 'temporary_today') {
    const start = random.int(8, 17);
    out.push({
      onDate: dayOffset(0),
      kind: 'window',
      startsAt: `${String(start).padStart(2, '0')}:00`,
      endsAt: `${String(Math.min(start + random.int(2, 4), 23)).padStart(2, '0')}:00`,
      note: 'זמינות מיוחדת',
    });
  } else if (random.chance(0.08)) {
    out.push({ onDate: dayOffset(random.int(1, 12)), kind: 'unavailable', note: 'יום חופש' });
  }
  return out;
}

/* ── Bulk insert ────────────────────────────────────────────────────────── */
async function insertProviders(client, providers) {
  const BATCH = 200;

  for (let start = 0; start < providers.length; start += BATCH) {
    const batch = providers.slice(start, start + BATCH);

    // auth.users + profiles + provider_profiles, one multi-row insert each.
    const users = [];
    const profiles = [];
    const profileRows = [];
    for (const p of batch) {
      const id = deterministicUuid(p.key);
      p.id = id;
      users.push([id, `${p.key}@synthetic.local`]);
      profiles.push([id, 'provider', p.fullName, `${p.key}@synthetic.local`]);
      profileRows.push([
        id, p.businessName, p.bio, p.reputation.years, p.verification,
        p.realtimeState, p.reputation.ratingAvg, p.reputation.ratingCount,
        p.reputation.completedJobs, p.reputation.cancelledJobs,
        p.reputation.completedJobs + p.reputation.cancelledJobs + Math.round(p.reputation.completedJobs * 0.3),
        p.reputation.completedJobs, p.responseSeconds, p.radiusKm,
      ]);
    }

    await client.query(
      `insert into auth.users (id, email)
       select (v->>0)::uuid, v->>1 from jsonb_array_elements($1::jsonb) v
       on conflict (id) do nothing`,
      [JSON.stringify(users)],
    );
    await client.query(
      `insert into profiles (id, role, full_name, email, is_demo)
       select (v->>0)::uuid, (v->>1)::user_role, v->>2, v->>3, true
         from jsonb_array_elements($1::jsonb) v
       on conflict (id) do nothing`,
      [JSON.stringify(profiles)],
    );
    await client.query(
      `insert into provider_profiles
         (id, business_name, bio, years_experience, verification, state,
          rating_avg, rating_count, completed_jobs, cancelled_jobs,
          offers_received, offers_accepted, avg_response_seconds, max_radius_km, is_demo)
       select (v->>0)::uuid, v->>1, v->>2, (v->>3)::int, (v->>4)::verification_status,
              (v->>5)::provider_state,
              nullif(v->>6,'')::numeric, (v->>7)::int, (v->>8)::int, (v->>9)::int,
              (v->>10)::int, (v->>11)::int, nullif(v->>12,'')::int, (v->>13)::numeric, true
         from jsonb_array_elements($1::jsonb) v
       on conflict (id) do nothing`,
      [JSON.stringify(profileRows)],
    );

    // Capabilities, areas, locations, schedules.
    const cats = [];
    const svcs = [];
    const areas = [];
    const locations = [];
    const rules = [];
    const overrides = [];

    for (const p of batch) {
      for (const [i, category] of p.categories.entries()) {
        cats.push([p.id, category.id, category.required_skills ?? [], i === 0]);
      }
      for (const service of p.services) {
        svcs.push([p.id, service.id, service.priceIls, service.durationMin]);
      }
      areas.push([p.id, `אזור ${p.region.name}`, p.position.lat, p.position.lon, p.radiusKm]);
      if (p.locationAgeSeconds !== null) {
        locations.push([
          p.id, p.position.lat, p.position.lon, p.heading,
          p.heading === null ? 0 : 32, 12,
          p.destination?.lat ?? null, p.destination?.lon ?? null, p.locationAgeSeconds,
        ]);
      }
      for (const [weekday, startsAt, endsAt] of p.schedule) {
        rules.push([p.id, weekday, startsAt, endsAt]);
      }
      for (const o of p.overrides) {
        overrides.push([p.id, o.onDate, o.kind, o.startsAt ?? null, o.endsAt ?? null, o.note ?? null]);
      }
    }

    await client.query(
      `insert into provider_categories (provider_id, category_id, skills, is_primary)
       select (v->>0)::uuid, (v->>1)::uuid,
              coalesce(array(select jsonb_array_elements_text(v->2)), '{}')::text[],
              (v->>3)::boolean
         from jsonb_array_elements($1::jsonb) v
       on conflict (provider_id, category_id) do nothing`,
      [JSON.stringify(cats)],
    );
    await client.query(
      `insert into provider_services (provider_id, service_id, price_ils, duration_min, is_active)
       select (v->>0)::uuid, (v->>1)::uuid, (v->>2)::numeric, (v->>3)::int, true
         from jsonb_array_elements($1::jsonb) v
       on conflict (provider_id, service_id) do nothing`,
      [JSON.stringify(svcs)],
    );
    /*
     * service_areas and provider_availability_rules have no natural unique
     * key — a provider may legitimately have two areas, or two windows on one
     * weekday — so ON CONFLICT cannot make these inserts idempotent. Without
     * this delete, a rerun WITHOUT --reset silently doubled every schedule
     * (4,914 rows became 9,828) while every other table upserted cleanly, and
     * seed validation passed because it counted providers, not rows.
     * Clearing the batch's own rows first makes a rerun converge.
     */
    const batchIds = batch.map((p) => p.id);
    await client.query('delete from service_areas where provider_id = any($1::uuid[])', [batchIds]);
    await client.query(
      'delete from provider_availability_rules where provider_id = any($1::uuid[])',
      [batchIds],
    );

    await client.query(
      `insert into service_areas (provider_id, label, center, radius_km, is_active)
       select (v->>0)::uuid, v->>1,
              st_point((v->>3)::double precision, (v->>2)::double precision)::geography,
              (v->>4)::numeric, true
         from jsonb_array_elements($1::jsonb) v`,
      [JSON.stringify(areas)],
    );
    await client.query(
      `insert into provider_locations
         (provider_id, location, heading_deg, speed_kmh, accuracy_m, destination, recorded_at)
       select (v->>0)::uuid,
              st_point((v->>2)::double precision, (v->>1)::double precision)::geography,
              nullif(v->>3,'')::numeric, (v->>4)::numeric, (v->>5)::numeric,
              case when nullif(v->>6,'') is null then null
                   else st_point((v->>7)::double precision, (v->>6)::double precision)::geography end,
              now() - make_interval(secs => (v->>8)::int)
         from jsonb_array_elements($1::jsonb) v
       on conflict (provider_id) do update
         set location    = excluded.location,
             heading_deg = excluded.heading_deg,
             speed_kmh   = excluded.speed_kmh,
             accuracy_m  = excluded.accuracy_m,
             destination = excluded.destination,
             recorded_at = excluded.recorded_at`,
      [JSON.stringify(locations)],
    );
    if (rules.length > 0) {
      await client.query(
        `insert into provider_availability_rules (provider_id, weekday, starts_at, ends_at)
         select (v->>0)::uuid, (v->>1)::smallint, (v->>2)::time, (v->>3)::time
           from jsonb_array_elements($1::jsonb) v`,
        [JSON.stringify(rules)],
      );
    }
    if (overrides.length > 0) {
      await client.query(
        `insert into provider_availability_overrides
           (provider_id, on_date, kind, starts_at, ends_at, note)
         select (v->>0)::uuid, (v->>1)::date, v->>2,
                nullif(v->>3,'')::time, nullif(v->>4,'')::time, nullif(v->>5,'')
           from jsonb_array_elements($1::jsonb) v
         on conflict (provider_id, on_date) do nothing`,
        [JSON.stringify(overrides)],
      );
    }

    process.stdout.write(`\r• inserted ${Math.min(start + BATCH, providers.length)}/${providers.length}`);
  }
  process.stdout.write('\n');
}

/** Stable UUID from the provider key, so reruns update rather than duplicate. */
function deterministicUuid(key) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i += 1) {
    h1 = Math.imul(h1 ^ key.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + key.charCodeAt(i) * (i + 7), 0x85ebca6b) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  const a = hex(h1);
  const b = hex(h2);
  const c = hex(Math.imul(h1 ^ h2, 0xc2b2ae35) >>> 0);
  // Version 4 / variant 8 nibbles keep it a well-formed UUID.
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-8${c.slice(1, 4)}-${c}${a.slice(0, 4)}`;
}

async function removeNetwork(client) {
  const { rows } = await client.query(
    `select id from auth.users where email like $1`,
    [`${TAG}-%@synthetic.local`],
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;

  await client.query('begin');
  try {
    /*
     * Order matters, and it used to be wrong: job_assignments.offer_id
     * references job_offers ON DELETE RESTRICT, so deleting the offers first
     * fails the moment any synthetic offer has been ACCEPTED. That became
     * reachable as soon as the demo simulator could accept on their behalf,
     * and the reset then aborted with a foreign-key error.
     *
     * A job whose assigned provider is about to stop existing is not a record
     * worth keeping, so the job goes too — and deleting the job cascades to
     * its offers and assignment. But a job belongs to a CUSTOMER, so this
     * refuses outright rather than deleting anything owned by a real one.
     */
    const { rows: risky } = await client.query(
      `select j.id
         from job_assignments a
         join jobs j on j.id = a.job_id
         join profiles customer on customer.id = j.customer_id
        where a.provider_id = any($1::uuid[])
          and customer.is_demo is not true`,
      [ids],
    );
    if (risky.length > 0) {
      throw new Error(
        `refusing to reset: ${risky.length} job(s) belonging to non-demo customers are ` +
        `assigned to synthetic providers (first: ${risky[0].id}). ` +
        `That should be impossible — investigate before re-seeding.`,
      );
    }

    const { rowCount: jobsRemoved } = await client.query(
      `delete from jobs j
        where exists (
          select 1 from job_assignments a
           where a.job_id = j.id and a.provider_id = any($1::uuid[])
        )`,
      [ids],
    );

    // Any remaining assignments, then the offers they pointed at.
    await client.query(`delete from job_assignments where provider_id = any($1::uuid[])`, [ids]);
    await client.query(`delete from job_offers where provider_id = any($1::uuid[])`, [ids]);
    await client.query(`delete from matching_events where provider_id = any($1::uuid[])`, [ids]);
    await client.query(`delete from auth.users where id = any($1::uuid[])`, [ids]);
    await client.query('commit');
    log(
      `• removed ${ids.length} synthetic providers` +
      (jobsRemoved ? ` and ${jobsRemoved} demo job(s) assigned to them` : ''),
    );
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function summarise(client) {
  const { rows } = await client.query(
    `select
       (select count(*) from provider_profiles pp join profiles p on p.id = pp.id
         where p.email like $1) as providers,
       (select count(*) from provider_profiles pp join profiles p on p.id = pp.id
         where p.email like $1 and pp.verification = 'VERIFIED') as verified,
       (select count(*) from provider_profiles pp join profiles p on p.id = pp.id
         where p.email like $1 and pp.state = 'ONLINE') as online,
       (select count(*) from provider_profiles pp join profiles p on p.id = pp.id
         where p.email like $1 and pp.rating_avg is null) as unrated,
       (select count(distinct category_id) from provider_categories pc
         join profiles p on p.id = pc.provider_id where p.email like $1) as categories,
       (select count(*) from provider_availability_rules r
         join profiles p on p.id = r.provider_id where p.email like $1) as schedule_rows,
       (select count(*) from provider_availability_overrides o
         join profiles p on p.id = o.provider_id where p.email like $1) as overrides,
       (select count(*) from provider_locations pl
         join profiles p on p.id = pl.provider_id
        where p.email like $1 and pl.destination is not null) as with_destination,
       (select count(*) from provider_services ps
         join profiles p on p.id = ps.provider_id where p.email like $1) as priced_services`,
    [`${TAG}-%@synthetic.local`],
  );
  const r = rows[0];
  return {
    'synthetic providers': r.providers,
    verified: r.verified,
    'online right now': r.online,
    'new (no rating)': r.unrated,
    'categories covered': r.categories,
    'weekly schedule rows': r.schedule_rows,
    'date overrides': r.overrides,
    'with a destination': r.with_destination,
    'priced services': r.priced_services,
  };
}

main().catch((error) => {
  process.stderr.write(`\n❌ ${error.message}\n`);
  process.exitCode = 1;
});
