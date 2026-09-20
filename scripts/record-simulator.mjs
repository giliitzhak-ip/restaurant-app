#!/usr/bin/env node
/**
 * Re-record the interface simulator's data from a real dispatch.
 *
 * The simulator holds a RECORDING, not an imitation: its numbers are the
 * `matching_events` rows the engine actually wrote for one job. That makes it
 * honest and it makes it perishable — the recording is only as current as the
 * seed it was taken against, and re-seeding writes fresh location fixes, new
 * providers and (since the ratings became derived) real review rows.
 *
 * Refreshing it used to be a paragraph of instructions in
 * docs/demo/README.md, which is how the shipped copy came to be describing a
 * 1000-provider network with `ratingBreakdown: null` for everyone long after
 * neither was true. A documented manual process is a process that drifts.
 *
 *   BASE_URL=http://127.0.0.1:3000 node scripts/record-simulator.mjs
 *
 * Writes the two constants back into docs/demo/getservice-simulator.html and
 * refuses to write anything it cannot verify.
 */
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const HTML = 'docs/demo/getservice-simulator.html';
const CUSTOMER = { email: 'rotem@demo.local', password: 'demo1234' };

/** The reference request, unchanged from the original recording. */
const JOB = {
  description: 'יש לי נזילה מתחת לכיור',
  lat: 32.0742,
  lon: 34.7749,
  accuracyM: 12,
  timing: 'NOW',
};

const connectionString =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://getservice:getservice@127.0.0.1:5432/getservice';

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const r2 = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100);

async function main() {
  /* ── 1. Sign in and dispatch a real job ───────────────────────────── */
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(CUSTOMER),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];

  const created = await fetch(`${BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(JOB),
  });
  const job = await created.json();
  if (!created.ok) throw new Error(`job failed: ${created.status} ${JSON.stringify(job)}`);
  log(`• job ${job.id} — ${job.dispatch.candidatesConsidered} candidates, ` +
      `${job.dispatch.offersCreated} offers, wave ${job.dispatch.wave}`);

  /* ── 2. Read back what the engine wrote ───────────────────────────── */
  const db = new pg.Client({ connectionString });
  await db.connect();
  /*
   * Every SCORED candidate, not just the ones offered.
   *
   * The first version of this filtered on `excluded_reason is null` and
   * recorded 5 rows where the previous recording had 25. It was dropping the
   * `below_cut` candidates — which carry a full set of signal scores and a
   * final_score, and are the whole point of the panel that shows who ranked
   * lower and why. `location_not_live` rows are the ones genuinely excluded
   * before scoring, and they have no scores to record.
   */
  let rows;
  let weights;
  try {
    ({ rows } = await db.query(
      `select m.provider_id, m.route_opportunity_score, m.skill_score,
              m.availability_score, m.eta_score, m.reliability_score,
              m.rating_score, m.price_score, m.experience_score,
              m.final_score, m.eta_minutes, m.straight_distance_km,
              m.is_on_the_way, m.offer_id is not null as offered,
              p.full_name, pp.business_name, pp.bio, pp.years_experience,
              pp.rating_avg, pp.rating_count, pp.completed_jobs,
              pp.avg_response_seconds, pp.state
         from matching_events m
         join provider_profiles pp on pp.id = m.provider_id
         join profiles p on p.id = m.provider_id
        where m.job_id = $1 and m.final_score is not null
        order by m.final_score desc`,
      [job.id],
    ));
    const w = await db.query(
      `select value from settings where key = 'matching.weights'`,
    );
    weights = w.rows[0]?.value;
  } finally {
    await db.end();
  }
  if (rows.length === 0) throw new Error('no matching_events rows — nothing to record');
  log(`• ${rows.length} scored candidates read back from matching_events`);

  /* ── 3. The customer-facing profile, from the endpoint the app calls ─ */
  const providers = [];
  for (const row of rows) {
    const res = await fetch(
      `${BASE}/api/providers/${row.provider_id}?service=${job.understanding.service}`,
      { headers: { cookie } },
    );
    if (!res.ok) throw new Error(`profile ${row.provider_id}: ${res.status}`);
    const p = await res.json();

    providers.push({
      name: p.fullName,
      biz: p.businessName ?? '',
      rating: p.ratingAvg === null ? null : r2(p.ratingAvg),
      reviews: p.ratingCount,
      jobs: p.completedJobs,
      years: p.yearsExperience,
      respSec: p.avgResponseSeconds,
      price: p.services.find((s) => s.isRequested)?.priceIls ?? null,
      km: r2(row.straight_distance_km),
      online: row.state === 'ONLINE',
      hours: p.availability?.todayWindow ?? null,
      onway: row.is_on_the_way,
      etaMin: r2(row.eta_minutes),
      offered: row.offered,
      sig: {
        routeOpportunity: r2(row.route_opportunity_score),
        skillMatch: r2(row.skill_score),
        availability: r2(row.availability_score),
        eta: r2(row.eta_score),
        reliability: r2(row.reliability_score),
        rating: r2(row.rating_score),
        price: r2(row.price_score),
        experience: r2(row.experience_score),
      },
      recordedScore: r2(row.final_score),
      bio: p.bio ?? '',
      services: p.services
        .filter((s) => s.priceIls !== null)
        .map((s) => [s.name, s.priceIls]),
      ratingBreakdown: p.ratingBreakdown,
      reviewsText: (p.reviews ?? []).slice(0, 3).map((rv) => ({
        rating: rv.rating,
        text: rv.comment,
      })),
    });
  }

  /* ── 4. Verify before writing: Σ score × weight must reproduce the
         recorded total, which is the page's whole claim. ─────────────── */
  const KEY = {
    routeOpportunity: 'routeOpportunity', skillMatch: 'skillMatch',
    availability: 'availability', eta: 'eta', reliability: 'reliability',
    rating: 'rating', price: 'price', experience: 'experience',
  };
  let worst = 0;
  for (const p of providers) {
    const total = Object.keys(KEY).reduce(
      (sum, k) => sum + (p.sig[k] ?? 0) * Number(weights?.[k] ?? 0), 0);
    worst = Math.max(worst, Math.abs(total - p.recordedScore));
  }
  if (worst > 0.05) {
    throw new Error(
      `Σ score × weight disagrees with the recorded final_score by ${worst.toFixed(3)} — ` +
      `refusing to write a recording the page cannot reproduce`);
  }
  log(`• Σ score × weight reproduces every recorded total (worst drift ${worst.toFixed(4)})`);

  /* ── 5. Splice the constant back in ───────────────────────────────── */
  const slug = (name, i) =>
    'p' + String(i + 1).padStart(2, '0') + '_' + name.split(' ')[0].replace(/[^֐-׿]/g, '');
  const body = providers.map((p, i) => {
    const q = (s) => JSON.stringify(s ?? '');
    return `  {
    id: ${q(slug(p.name, i))}, name: ${q(p.name)}, biz: ${q(p.biz)},
    rating: ${p.rating}, reviews: ${p.reviews}, jobs: ${p.jobs}, years: ${p.years}, respSec: ${p.respSec},
    price: ${p.price}, km: ${p.km}, online: ${p.online}, hours: ${p.hours === null ? 'null' : q(p.hours)},
    onway: ${p.onway}, etaMin: ${p.etaMin}, offered: ${p.offered},
    /* The recorded per-signal scores for this job, 0..100. */
    sig: { routeOpportunity: ${p.sig.routeOpportunity}, skillMatch: ${p.sig.skillMatch}, availability: ${p.sig.availability},
           eta: ${p.sig.eta}, reliability: ${p.sig.reliability}, rating: ${p.sig.rating},
           price: ${p.sig.price}, experience: ${p.sig.experience} },
    recordedScore: ${p.recordedScore},
    bio: ${q(p.bio)},
    services: ${JSON.stringify(p.services)},
    ratingBreakdown: ${JSON.stringify(p.ratingBreakdown)}, reviewsText: ${JSON.stringify(p.reviewsText)}
  }`;
  }).join(',\n');

  const html = readFileSync(HTML, 'utf8');
  const start = html.indexOf('const PROVIDERS = [');
  const end = html.indexOf('\n];', start);
  if (start === -1 || end === -1) throw new Error('PROVIDERS constant not found in the page');
  const next = html.slice(0, start) + 'const PROVIDERS = [\n' + body + html.slice(end);
  writeFileSync(HTML, next);

  log(`\n✅ recording refreshed`);
  log(`   providers          ${providers.length}`);
  log(`   with a rating      ${providers.filter((p) => p.rating !== null).length}`);
  log(`   with a breakdown   ${providers.filter((p) => p.ratingBreakdown).length}`);
  log(`   offered in wave 1  ${providers.filter((p) => p.offered).length}`);
  log(`   on the way         ${providers.filter((p) => p.onway).length}`);
}

main().catch((error) => {
  process.stderr.write(`\n❌ ${error.message}\n`);
  process.exitCode = 1;
});
