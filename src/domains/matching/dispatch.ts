import { getMapProvider } from '@/domains/geo';
import type { DbSession } from '@/lib/db';
import { withSystem } from '@/lib/db';
import { logOperation } from '@/lib/logger';
import { loadMatchingConfiguration } from '@/lib/settings';
import { MatchingEngine } from './engine';
import type { MatchRequest, ProviderCandidate, ScoredCandidate } from './types';
import type { DispatchWave } from './config';

/**
 * DispatchManager (spec §16).
 *
 * Does NOT notify every professional. Offers go out in waves to the best few
 * candidates; if nobody takes it, the radius expands (5km → 10km → 20km, all
 * configurable) until the waves are exhausted.
 *
 * Runs entirely server-side with the system role: it has already established
 * what it is allowed to do, and a customer must never be able to drive
 * dispatch parameters.
 */

interface CandidateRow {
  provider_id: string;
  full_name: string;
  business_name: string | null;
  state: 'OFFLINE' | 'ONLINE' | 'BUSY';
  rating_avg: string | null;
  rating_count: number;
  completed_jobs: number;
  cancelled_jobs: number;
  offers_received: number;
  offers_accepted: number;
  avg_response_seconds: number | null;
  years_experience: number;
  max_radius_km: string;
  skills: string[];
  price_ils: string | null;
  duration_min: number | null;
  lat: number;
  lon: number;
  heading_deg: string | null;
  speed_kmh: string | null;
  accuracy_m: string | null;
  location_age_seconds: string;
  dest_lat: number | null;
  dest_lon: number | null;
  straight_distance_km: string;
  in_service_area: boolean;
}

const num = (value: string | number | null): number | null =>
  value === null ? null : typeof value === 'number' ? value : Number(value);

function toCandidate(row: CandidateRow): ProviderCandidate {
  return {
    providerId: row.provider_id,
    fullName: row.full_name,
    businessName: row.business_name,
    state: row.state,
    location: { lat: row.lat, lon: row.lon },
    headingDeg: num(row.heading_deg),
    speedKmh: num(row.speed_kmh),
    accuracyM: num(row.accuracy_m),
    locationAgeSeconds: num(row.location_age_seconds) ?? Number.MAX_SAFE_INTEGER,
    destination:
      row.dest_lat !== null && row.dest_lon !== null
        ? { lat: row.dest_lat, lon: row.dest_lon }
        : null,
    skills: row.skills ?? [],
    priceIls: num(row.price_ils),
    ratingAvg: num(row.rating_avg),
    ratingCount: row.rating_count,
    completedJobs: row.completed_jobs,
    cancelledJobs: row.cancelled_jobs,
    offersReceived: row.offers_received,
    offersAccepted: row.offers_accepted,
    avgResponseSeconds: row.avg_response_seconds,
    yearsExperience: row.years_experience,
    maxRadiusKm: num(row.max_radius_km) ?? 15,
    inServiceArea: row.in_service_area,
    straightDistanceKm: num(row.straight_distance_km) ?? 0,
  };
}

interface JobRow {
  id: string;
  customer_id: string;
  status: string;
  lat: number;
  lon: number;
  location_accuracy_m: string | null;
  category_id: string | null;
  service_id: string | null;
  category_slug: string | null;
  service_slug: string | null;
  required_skills: string[] | null;
  urgency: 'low' | 'normal' | 'high' | 'emergency';
  base_price_ils: string | null;
  dispatch_wave: number;
}

export interface DispatchOutcome {
  readonly jobId: string;
  readonly wave: number;
  readonly radiusKm: number;
  readonly candidatesConsidered: number;
  readonly offersCreated: number;
  readonly exhausted: boolean;
  readonly topScore: number | null;
}

async function loadJob(db: DbSession, jobId: string): Promise<JobRow | null> {
  return db.one<JobRow>(
    `select j.id, j.customer_id, j.status::text as status,
            st_y(j.location::geometry) as lat,
            st_x(j.location::geometry) as lon,
            j.location_accuracy_m, j.category_id, j.service_id,
            c.slug as category_slug, s.slug as service_slug,
            coalesce(nullif(s.required_skills, '{}'), c.required_skills) as required_skills,
            j.urgency, s.base_price_ils, j.dispatch_wave
       from jobs j
       left join categories c on c.id = j.category_id
       left join services s on s.id = j.service_id
      where j.id = $1`,
    [jobId],
  );
}

/**
 * Run one dispatch wave for a job.
 *
 * Idempotent in the sense that it never offers the same job to a provider
 * twice: find_candidate_providers excludes anyone who already has an offer.
 */
export async function runDispatchWave(
  jobId: string,
  options: { waveOverride?: number } = {},
): Promise<DispatchOutcome> {
  return withSystem(async (db) => {
    const config = await loadMatchingConfiguration(db);
    const job = await loadJob(db, jobId);

    if (!job) throw new Error(`Job ${jobId} not found`);
    if (!job.category_id) {
      throw new Error(`Job ${jobId} has no category; it cannot be dispatched`);
    }

    const nextWaveNumber = options.waveOverride ?? job.dispatch_wave + 1;
    const wave: DispatchWave | undefined = config.dispatch.waves.find(
      (w) => w.wave === nextWaveNumber,
    );

    // Waves exhausted: give up honestly rather than searching forever.
    if (!wave) {
      await db.query(
        `select set_config('app.actor_role','system',true),
                set_config('app.transition_reason','No provider found after final dispatch wave',true)`,
      );
      await db.query(
        `update jobs set status = 'CANCELLED_BY_SYSTEM' where id = $1
           and status in ('SEARCHING','OFFERS_AVAILABLE')`,
        [jobId],
      );
      logOperation({
        jobId, operation: 'dispatch.exhausted', result: 'ok',
        meta: { lastWave: job.dispatch_wave },
      });
      return {
        jobId, wave: job.dispatch_wave, radiusKm: 0,
        candidatesConsidered: 0, offersCreated: 0, exhausted: true, topScore: null,
      };
    }

    // ── CandidateFinder + GeoFilter (PostGIS, with the staleness cutoff) ──
    const rows = await db.many<CandidateRow>(
      'select * from find_candidate_providers($1, $2, $3, $4)',
      [jobId, wave.radiusKm, config.thresholds.maxLocationAgeSeconds, config.thresholds.candidateHardLimit],
    );
    const candidates = rows.map(toCandidate);

    const request: MatchRequest = {
      jobId,
      customerLocation: { lat: job.lat, lon: job.lon },
      locationAccuracyM: num(job.location_accuracy_m),
      categorySlug: job.category_slug ?? '',
      serviceSlug: job.service_slug,
      requiredSkills: job.required_skills ?? [],
      urgency: job.urgency,
      referencePriceIls: num(job.base_price_ils),
    };

    const engine = new MatchingEngine(getMapProvider(), {
      weights: config.weights,
      thresholds: config.thresholds,
    });
    const result = await engine.match(candidates, request);

    // Only offer candidates good enough to be worth someone's attention.
    const eligible = result.ranked.filter(
      (c) => c.finalScore >= config.thresholds.minScoreToOffer,
    );
    const selected = eligible.slice(0, wave.maxProviders);

    const expiresAt = new Date(Date.now() + config.dispatch.offerTtlSeconds * 1000);
    let offersCreated = 0;

    for (const scored of selected) {
      const offer = await db.one<{ id: string }>(
        `insert into job_offers
           (job_id, provider_id, wave, price_ils, eta_minutes, eta_confidence,
            distance_km, is_on_the_way, final_score, score_breakdown, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (job_id, provider_id) do nothing
         returning id`,
        [
          jobId,
          scored.candidate.providerId,
          wave.wave,
          scored.priceIls,
          scored.etaMinutes === null ? null : Math.round(scored.etaMinutes),
          scored.etaConfidence,
          scored.routeDistanceKm,
          scored.routeOpportunity.isOnTheWay,
          scored.finalScore,
          JSON.stringify(scored.breakdown),
          expiresAt,
        ],
      );
      if (!offer) continue;
      offersCreated += 1;

      await recordMatchingEvent(db, jobId, scored, offer.id, wave.wave, request);

      await db.query(
        `update provider_profiles set offers_received = offers_received + 1 where id = $1`,
        [scored.candidate.providerId],
      );

      await db.query(
        `insert into notifications (user_id, job_id, kind, title, body, payload)
         values ($1,$2,'offer.new',$3,$4,$5)`,
        [
          scored.candidate.providerId,
          jobId,
          'עבודה חדשה באזור שלך',
          scored.routeOpportunity.isOnTheWay ? 'עבודה בדרך שלך' : 'עבודה חדשה מחכה לך',
          JSON.stringify({ offerId: offer.id, isOnTheWay: scored.routeOpportunity.isOnTheWay }),
        ],
      );
    }

    // Telemetry for candidates we considered but did not offer (spec §36).
    for (const scored of result.ranked.filter((c) => !selected.includes(c))) {
      await recordMatchingEvent(db, jobId, scored, null, wave.wave, request, 'below_cut');
    }
    for (const { candidate, reason } of result.excluded) {
      await db.query(
        `insert into matching_events
           (job_id, provider_id, wave, provider_location, customer_location,
            provider_heading_deg, straight_distance_km, excluded_reason)
         values ($1,$2,$3, st_point($5,$4)::geography, st_point($7,$6)::geography, $8,$9,$10)`,
        [
          jobId, candidate.providerId, wave.wave,
          candidate.location.lat, candidate.location.lon,
          job.lat, job.lon,
          candidate.headingDeg, candidate.straightDistanceKm, reason,
        ],
      );
    }

    await db.query(
      `update jobs
          set dispatch_wave = $2,
              dispatch_radius_km = $3,
              search_started_at = coalesce(search_started_at, now())
        where id = $1`,
      [jobId, wave.wave, wave.radiusKm],
    );

    // SEARCHING → OFFERS_AVAILABLE, but only if we actually sent something.
    if (offersCreated > 0) {
      await db.query(
        `select set_config('app.actor_role','system',true),
                set_config('app.transition_reason',$1,true)`,
        [`Wave ${wave.wave}: ${offersCreated} offers sent within ${wave.radiusKm}km`],
      );
      await db.query(
        `update jobs set status = 'OFFERS_AVAILABLE'
          where id = $1 and status = 'SEARCHING'`,
        [jobId],
      );
    }

    logOperation({
      jobId,
      operation: 'dispatch.wave',
      result: 'ok',
      meta: {
        wave: wave.wave,
        radiusKm: wave.radiusKm,
        considered: candidates.length,
        offers: offersCreated,
        excluded: result.excluded.length,
      },
    });

    return {
      jobId,
      wave: wave.wave,
      radiusKm: wave.radiusKm,
      candidatesConsidered: candidates.length,
      offersCreated,
      exhausted: false,
      topScore: selected[0]?.finalScore ?? null,
    };
  });
}

async function recordMatchingEvent(
  db: DbSession,
  jobId: string,
  scored: ScoredCandidate,
  offerId: string | null,
  wave: number,
  request: MatchRequest,
  excludedReason?: string,
): Promise<void> {
  const { candidate, breakdown, routeOpportunity } = scored;
  await db.query(
    `insert into matching_events (
       job_id, provider_id, offer_id, wave,
       provider_location, customer_location, provider_heading_deg, provider_destination,
       straight_distance_km, route_distance_km, route_deviation_min, route_deviation_km,
       eta_minutes, eta_confidence, is_on_the_way,
       route_opportunity_score, skill_score, availability_score, eta_score,
       reliability_score, rating_score, price_score, experience_score, final_score,
       weights_used, excluded_reason, notified_at
     ) values (
       $1,$2,$3,$4,
       st_point($6,$5)::geography, st_point($8,$7)::geography, $9,
       case when $10::double precision is null then null else st_point($11,$10)::geography end,
       $12,$13,$14,$15,
       $16,$17,$18,
       $19,$20,$21,$22,$23,$24,$25,$26,$27,
       $28,$29, case when $3::uuid is null then null else now() end
     )`,
    [
      jobId, candidate.providerId, offerId, wave,
      candidate.location.lat, candidate.location.lon,
      request.customerLocation.lat, request.customerLocation.lon,
      candidate.headingDeg,
      candidate.destination?.lat ?? null, candidate.destination?.lon ?? null,
      candidate.straightDistanceKm, scored.routeDistanceKm,
      routeOpportunity.routeDeviationMinutes, routeOpportunity.routeDeviationDistance,
      scored.etaMinutes, scored.etaConfidence, routeOpportunity.isOnTheWay,
      breakdown.routeOpportunity.score, breakdown.skillMatch.score,
      breakdown.availability.score, breakdown.eta.score,
      breakdown.reliability.score, breakdown.rating.score,
      breakdown.price.score, breakdown.experience.score, scored.finalScore,
      JSON.stringify(scored.weightsUsed), excludedReason ?? null,
    ],
  );
}

/**
 * Expire stale offers and escalate any job still waiting to its next wave
 * (spec §16, §44 "Offer expires — cannot be accepted").
 *
 * Safe to call repeatedly; it is the maintenance tick behind /api/maintenance.
 */
export async function expireAndEscalate(): Promise<{
  expiredOffers: number;
  escalated: string[];
}> {
  const { expired, stalled } = await withSystem(async (db) => {
    const expiredRow = await db.one<{ expire_stale_offers: number }>(
      'select expire_stale_offers()',
    );

    // Jobs that were waiting on offers, where nothing is pending any more.
    const stalledRows = await db.many<{ id: string }>(
      `select j.id
         from jobs j
        where j.status in ('SEARCHING','OFFERS_AVAILABLE')
          and not exists (
            select 1 from job_offers o
             where o.job_id = j.id and o.status = 'PENDING'
          )
          and not exists (select 1 from job_assignments a where a.job_id = j.id)`,
    );

    return {
      expired: expiredRow?.expire_stale_offers ?? 0,
      stalled: stalledRows.map((r) => r.id),
    };
  });

  const escalated: string[] = [];
  for (const jobId of stalled) {
    try {
      // Back to SEARCHING first so the transition is legal and audited.
      await withSystem(
        async (db) => {
          await db.query(
            `update jobs set status = 'SEARCHING'
              where id = $1 and status = 'OFFERS_AVAILABLE'`,
            [jobId],
          );
        },
        { actorRole: 'system', transitionReason: 'All offers expired; widening search' },
      );
      const outcome = await runDispatchWave(jobId);
      if (outcome.offersCreated > 0 || outcome.exhausted) escalated.push(jobId);
    } catch (error) {
      logOperation({
        jobId,
        operation: 'dispatch.escalate',
        result: 'error',
        meta: { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      });
    }
  }

  return { expiredOffers: expired, escalated };
}
