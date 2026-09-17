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

/**
 * A check that must meet a minimum.
 *
 * `hint` is appended to the detail only on FAILURE. Several of these
 * properties hold for a freshly generated network and can be legitimately
 * changed by something else later — the demo tick refreshing locations, for
 * instance — and the report should say so rather than leaving the reader to
 * work out why a check that passed this morning fails now.
 */
async function mustBeAtLeast(label, minimum, sql, hint = null) {
  const { rows } = await client.query(sql);
  const value = Number(rows[0]?.n ?? 0);
  const ok = value >= minimum;
  results.push({
    label,
    ok,
    detail: `${value} (need ≥ ${minimum})${!ok && hint ? ` — ${hint}` : ''}`,
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
  // The generated network deliberately contains stale fixes, so the "a stale
  // fix is not a live fix" path in matching is exercised by real data rather
  // than only by a unit test. Note the ordering constraint: the demo tick
  // refreshes every demo location, so after running it this check fails
  // honestly — the dataset no longer has the property. Validate on a freshly
  // seeded network (npm run db:network -- --reset).
  await mustBeAtLeast(
    'stale locations present', 10,
    `select count(*) as n from provider_locations where recorded_at < now() - interval '5 minutes'`,
    'the demo tick refreshes all demo locations — re-seed before validating',
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
  /*
   * The aggregate must equal its own detail.
   *
   * This is the check that makes A-013 impossible to reintroduce. Every
   * synthetic provider used to carry a rating_count with no review rows
   * behind it — up to 2,400 of them — which the API disclosed by returning a
   * null breakdown and the screen disclosed in words, and which was still a
   * number the database could not support. The counters are now derived from
   * the rows, so this asserts they stayed that way.
   */
  await mustBeEmpty(
    'rating_count disagrees with the review rows',
    `select count(*) as n from provider_profiles pp
       join profiles p on p.id = pp.id
      where p.email like 'gsnet-%@synthetic.local'
        and pp.rating_count <> (
          select count(*) from reviews r
           where r.subject_id = pp.id and r.direction = 'customer_to_provider'
        )`,
  );
  await mustBeEmpty(
    'rating_avg disagrees with the review rows',
    `select count(*) as n from provider_profiles pp
       join profiles p on p.id = pp.id
      where p.email like 'gsnet-%@synthetic.local'
        and pp.rating_count > 0
        and pp.rating_avg <> (
          select round(avg(r.rating)::numeric, 2) from reviews r
           where r.subject_id = pp.id and r.direction = 'customer_to_provider'
        )`,
  );
  await mustBeEmpty(
    'completed_jobs disagrees with the assignment rows',
    `select count(*) as n from provider_profiles pp
       join profiles p on p.id = pp.id
      where p.email like 'gsnet-%@synthetic.local'
        and pp.completed_jobs <> (
          select count(*) from job_assignments a where a.provider_id = pp.id
        )`,
  );
  await mustBeAtLeast(
    'reviews behind the ratings', 2000,
    `select count(*) as n from reviews r
       join profiles p on p.id = r.subject_id
      where p.email like 'gsnet-%@synthetic.local'`,
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
    'duplicate schedule window',
    // Caught a real idempotency bug: seed-network had no unique key and no
    // pre-delete for provider_availability_rules, so a rerun without --reset
    // doubled every schedule. Row COUNTS all still looked plausible.
    `select count(*) as n from (
       select provider_id, weekday, starts_at, ends_at
         from provider_availability_rules
        group by 1,2,3,4 having count(*) > 1
     ) t`,
  );
  await mustBeEmpty(
    'duplicate service area',
    `select count(*) as n from (
       select provider_id, center, radius_km from service_areas
        group by 1,2,3 having count(*) > 1
     ) t`,
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
  /*
   * Scoped to the synthetic network, which is what this script validates.
   *
   * Unscoped it also flagged hand-registered accounts, and for them the state
   * is not a defect: a provider who has declared a trade and not yet entered
   * prices is mid-onboarding, and a provider whose only priced service was an
   * approved trade that was later removed is a consequence of that removal.
   * A seed validator that goes red because somebody registered an account by
   * hand is a validator people learn to ignore.
   */
  await mustBeEmpty(
    'synthetic provider with a trade but no priced service',
    `select count(*) as n from provider_profiles pp
       join profiles p on p.id = pp.id
      where p.email like 'gsnet-%@synthetic.local'
        and exists (select 1 from provider_categories pc where pc.provider_id = pp.id)
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
