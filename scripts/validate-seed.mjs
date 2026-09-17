#!/usr/bin/env node
/**
 * Seed validation (spec §57, §58).
 *
 * Generated data is only useful if its invariants hold. A dataset that says
 * a provider has 4.9 stars from zero reviews, or a schedule window that ends
 * before it starts, silently corrupts every matching test that rests on it.
 *
 * Exits non-zero on any failure, so it can gate a release.
 */
import process from 'node:process';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgresql://getservice:getservice@127.0.0.1:5432/getservice';

const client = new pg.Client({ connectionString });
const results = [];

/** A check that must return zero rows; anything else is a violation. */
async function mustBeEmpty(label, sql, params = []) {
  const { rows } = await client.query(sql, params);
  const count = Number(rows[0]?.n ?? rows.length);
  results.push({ label, ok: count === 0, detail: count === 0 ? 'none' : `${count} violation(s)` });
}

/** A check that must meet a minimum. */
async function mustBeAtLeast(label, minimum, sql, params = []) {
  const { rows } = await client.query(sql, params);
  const value = Number(rows[0]?.n ?? 0);
  results.push({
    label,
    ok: value >= minimum,
    detail: `${value} (need ≥ ${minimum})`,
  });
}

async function main() {
  await client.connect();

  /* ── Coverage (spec §58) ───────────────────────────────────────────── */
  await mustBeAtLeast('provider count', 1000, 'select count(*) as n from provider_profiles');
  await mustBeAtLeast(
    'MVP categories represented', 7,
    'select count(distinct category_id) as n from provider_categories',
  );
  await mustBeAtLeast(
    'geographic regions represented', 10,
    `select count(distinct round(st_y(center::geometry)::numeric, 1)) as n from service_areas`,
  );
  await mustBeAtLeast(
    'distinct rating values', 50,
    'select count(distinct rating_avg) as n from provider_profiles where rating_avg is not null',
  );
  await mustBeAtLeast(
    'new providers (no rating)', 20,
    'select count(*) as n from provider_profiles where rating_avg is null and rating_count = 0',
  );
  await mustBeAtLeast(
    'verification states represented', 3,
    'select count(distinct verification) as n from provider_profiles',
  );
  await mustBeAtLeast(
    'providers online now', 50,
    `select count(*) as n from provider_profiles where state = 'ONLINE'`,
  );
  await mustBeAtLeast(
    'providers with planned hours', 200,
    'select count(distinct provider_id) as n from provider_availability_rules',
  );
  await mustBeAtLeast(
    'date overrides present', 20,
    'select count(*) as n from provider_availability_overrides',
  );
  await mustBeAtLeast(
    'route scenarios (destination set)', 50,
    'select count(*) as n from provider_locations where destination is not null',
  );
  await mustBeAtLeast(
    'stale locations present', 10,
    `select count(*) as n from provider_locations where recorded_at < now() - interval '5 minutes'`,
  );
  await mustBeAtLeast(
    'split-shift schedules present', 10,
    `select count(*) as n from (
       select provider_id, weekday from provider_availability_rules
        group by provider_id, weekday having count(*) > 1
     ) t`,
  );

  /* ── Integrity (spec §57) ──────────────────────────────────────────── */
  await mustBeEmpty(
    'rating without reviews',
    'select count(*) as n from provider_profiles where rating_avg is not null and rating_count = 0',
  );
  await mustBeEmpty(
    'reviews without rating',
    'select count(*) as n from provider_profiles where rating_count > 0 and rating_avg is null',
  );
  await mustBeEmpty(
    'rating outside 1..5',
    'select count(*) as n from provider_profiles where rating_avg is not null and (rating_avg < 1 or rating_avg > 5)',
  );
  await mustBeEmpty(
    'completed jobs below review count',
    // A review requires a completed job, so completions can never trail reviews.
    'select count(*) as n from provider_profiles where rating_count > completed_jobs',
  );
  await mustBeEmpty(
    'accepted offers exceed offers received',
    'select count(*) as n from provider_profiles where offers_accepted > offers_received',
  );
  await mustBeEmpty(
    'impossible schedule window',
    'select count(*) as n from provider_availability_rules where ends_at <= starts_at',
  );
  await mustBeEmpty(
    'impossible override window',
    `select count(*) as n from provider_availability_overrides
      where kind = 'window' and (starts_at is null or ends_at is null or ends_at <= starts_at)`,
  );
  await mustBeEmpty(
    'weekday out of range',
    'select count(*) as n from provider_availability_rules where weekday < 0 or weekday > 6',
  );
  await mustBeEmpty(
    'invalid coordinates',
    `select count(*) as n from provider_locations
      where st_y(location::geometry) not between -90 and 90
         or st_x(location::geometry) not between -180 and 180`,
  );
  await mustBeEmpty(
    'coordinates outside Israel envelope',
    // Sanity, not geofencing: a synthetic provider in the Atlantic is a bug.
    `select count(*) as n from provider_locations
      where st_y(location::geometry) not between 29.0 and 33.5
         or st_x(location::geometry) not between 34.0 and 36.0`,
  );
  await mustBeEmpty(
    'negative or absurd price',
    'select count(*) as n from provider_services where price_ils is not null and (price_ils < 0 or price_ils > 100000)',
  );
  await mustBeEmpty(
    'provider with a trade but no priced service',
    `select count(*) as n from provider_profiles pp
      where exists (select 1 from provider_categories pc where pc.provider_id = pp.id)
        and not exists (
          select 1 from provider_services ps
           where ps.provider_id = pp.id and ps.is_active and ps.price_ils is not null
        )`,
  );
  await mustBeEmpty(
    'service priced outside its own category',
    `select count(*) as n from provider_services ps
       join services s on s.id = ps.service_id
      where not exists (
        select 1 from provider_categories pc
         where pc.provider_id = ps.provider_id and pc.category_id = s.category_id
      )`,
  );
  await mustBeEmpty(
    'orphan provider profile (no profiles row)',
    'select count(*) as n from provider_profiles pp where not exists (select 1 from profiles p where p.id = pp.id)',
  );
  await mustBeEmpty(
    'orphan job offer',
    `select count(*) as n from job_offers o
      where not exists (select 1 from jobs j where j.id = o.job_id)
         or not exists (select 1 from provider_profiles p where p.id = o.provider_id)`,
  );
  await mustBeEmpty(
    'verified provider with no service area',
    `select count(*) as n from provider_profiles pp
      where pp.verification = 'VERIFIED'
        and not exists (select 1 from service_areas sa where sa.provider_id = pp.id and sa.is_active)`,
  );
  await mustBeEmpty(
    'synthetic provider not tagged is_demo',
    `select count(*) as n from provider_profiles pp
       join profiles p on p.id = pp.id
      where p.email like 'gsnet-%@synthetic.local' and (pp.is_demo is not true or p.is_demo is not true)`,
  );
  await mustBeEmpty(
    'ONLINE provider that is not verified',
    `select count(*) as n from provider_profiles where state = 'ONLINE' and verification <> 'VERIFIED'`,
  );

  /* ── Report ────────────────────────────────────────────────────────── */
  const failures = results.filter((r) => !r.ok);
  const width = Math.max(...results.map((r) => r.label.length));

  process.stdout.write('\nSeed validation\n\n');
  for (const r of results) {
    process.stdout.write(`  ${r.ok ? '✓' : '✗'} ${r.label.padEnd(width)}  ${r.detail}\n`);
  }
  process.stdout.write(
    `\n${failures.length === 0 ? '✅' : '❌'} ${results.length - failures.length}/${results.length} checks passed\n`,
  );

  if (failures.length > 0) {
    process.stdout.write('\nFailed:\n');
    for (const f of failures) process.stdout.write(`  • ${f.label}: ${f.detail}\n`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    process.stderr.write(`\n❌ validation failed to run: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
