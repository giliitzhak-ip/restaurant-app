import type { MatchWeights, MatchingSettings } from '@/lib/services/settings/schema';
import { SETTINGS_DEFAULTS } from '@/lib/services/settings/schema';
import type { MatchCandidate, MatchJobContext, ScoreBreakdown, ScoredCandidate } from './types';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Recent-enough position to treat the provider as genuinely on the move. */
const FRESH_LOCATION_SECONDS = 15 * 60;
/** Response time at which the speed score bottoms out. */
const SLOW_RESPONSE_SECONDS = 30 * 60;
/** Completed-job count treated as "fully established". */
const ESTABLISHED_JOBS = 50;
/** Score given to a provider with no ratings yet — neutral, not punished. */
const UNRATED_BASELINE = 0.6;

/**
 * Distance decays linearly across the radius currently being searched, so a
 * provider 2 km away in a 5 km search scores the same as one 8 km away in a
 * 20 km search — the customer's realistic alternatives are what matter.
 */
export function distanceScore(distanceKm: number, radiusKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  const span = Math.max(radiusKm, 1);
  return clamp01(1 - distanceKm / span);
}

export function ratingScore(ratingAvg: number, ratingCount: number): number {
  if (!ratingCount) return UNRATED_BASELINE;
  // 1★ → 0, 5★ → 1
  const normalised = clamp01((ratingAvg - 1) / 4);
  // A single 5★ review should not outrank a long, strong history.
  const confidence = clamp01(ratingCount / 10);
  return clamp01(UNRATED_BASELINE + (normalised - UNRATED_BASELINE) * (0.4 + 0.6 * confidence));
}

/**
 * Being toggled "available" is most of it; a freshly reported position proves
 * the provider is actually active right now rather than idling on the toggle.
 */
export function availabilityScore(
  isAvailable: boolean,
  locationAgeSeconds: number | null,
  urgency: MatchJobContext['urgency'],
): number {
  if (!isAvailable) {
    // Scheduled work can still go to someone who is offline at this moment.
    return urgency === 'now' ? 0 : 0.35;
  }
  if (locationAgeSeconds === null) return 0.8;
  return clamp01(0.8 + 0.2 * (1 - Math.min(1, locationAgeSeconds / FRESH_LOCATION_SECONDS)));
}

/** Category is a hard filter upstream; matching the exact service is the signal. */
export function categoryMatchScore(matchesService: boolean, serviceRequested: boolean): number {
  if (!serviceRequested) return 0.85;
  return matchesService ? 1 : 0.55;
}

export function responseSpeedScore(avgResponseSeconds: number | null): number {
  if (avgResponseSeconds === null) return 0.5; // no history yet
  return clamp01(1 - avgResponseSeconds / SLOW_RESPONSE_SECONDS);
}

/** Logarithmic: the step from 0 to 5 jobs matters more than 45 to 50. */
export function experienceScore(completedJobs: number): number {
  if (completedJobs <= 0) return 0;
  return clamp01(Math.log10(1 + completedJobs) / Math.log10(1 + ESTABLISHED_JOBS));
}

/** How well the provider's call-out price sits inside the customer's budget. */
export function priceFitScore(
  basePrice: number | null,
  budgetMin: number | null | undefined,
  budgetMax: number | null | undefined,
): number {
  if (basePrice === null || basePrice === undefined) return 0;
  if (!budgetMax) return 0;
  if (basePrice <= budgetMax) return 1;
  // Over budget: fades out once the provider is 50% above the ceiling.
  return clamp01(1 - (basePrice - budgetMax) / (budgetMax * 0.5));
}

/** Cancellation history is a penalty, never a bonus. */
export function reliabilityScore(completedJobs: number, cancelledJobs: number): number {
  const total = completedJobs + cancelledJobs;
  if (total < 3) return 0;
  const cancelRate = cancelledJobs / total;
  const penalty = clamp01(cancelRate * 2);
  // Avoid -0, which is confusing in breakdowns and in test assertions.
  return penalty === 0 ? 0 : -penalty;
}

export function scoreCandidate(
  candidate: MatchCandidate,
  context: MatchJobContext,
  weights: MatchWeights = SETTINGS_DEFAULTS.match_weights,
  settings: MatchingSettings = SETTINGS_DEFAULTS.matching,
): ScoredCandidate {
  const breakdown: ScoreBreakdown = {
    distance: distanceScore(candidate.distanceKm, context.searchRadiusKm),
    rating: ratingScore(candidate.ratingAvg, candidate.ratingCount),
    availability: availabilityScore(
      candidate.isAvailable,
      candidate.locationAgeSeconds,
      context.urgency,
    ),
    categoryMatch: categoryMatchScore(candidate.matchesService, Boolean(context.serviceId)),
    responseSpeed: responseSpeedScore(candidate.avgResponseSeconds),
    completedJobs: experienceScore(candidate.completedJobs),
    modifiers: {
      favorite:
        settings.prefer_favorites && context.favoriteProviderIds?.includes(candidate.providerId)
          ? settings.favorite_bonus
          : 0,
      serviceArea: candidate.servesArea ? 0.04 : 0,
      priceFit:
        priceFitScore(candidate.basePrice, context.budgetMin, context.budgetMax) * 0.04,
      reliability: reliabilityScore(candidate.completedJobs, candidate.cancelledJobs) * 0.1,
    },
  };

  const weighted =
    breakdown.distance * weights.distance +
    breakdown.rating * weights.rating +
    breakdown.availability * weights.availability +
    breakdown.categoryMatch * weights.category_match +
    breakdown.responseSpeed * weights.response_speed +
    breakdown.completedJobs * weights.completed_jobs;

  const modifierTotal =
    breakdown.modifiers.favorite +
    breakdown.modifiers.serviceArea +
    breakdown.modifiers.priceFit +
    breakdown.modifiers.reliability;

  const score = clamp01(weighted + modifierTotal) * 100;

  return { candidate, score: Math.round(score * 100) / 100, breakdown };
}

/**
 * Ranks the candidate pool and trims it to the shortlist size. Ties break on
 * distance, then rating, then provider id so the ordering is deterministic —
 * important for tests and for not reshuffling a customer's list on refresh.
 */
export function rankCandidates(
  candidates: MatchCandidate[],
  context: MatchJobContext,
  weights: MatchWeights = SETTINGS_DEFAULTS.match_weights,
  settings: MatchingSettings = SETTINGS_DEFAULTS.matching,
): ScoredCandidate[] {
  const eligible = settings.verified_only ? candidates.filter((c) => c.isVerified) : candidates;

  return eligible
    .filter((c) => c.distanceKm <= settings.max_distance_km || c.servesArea)
    .map((c) => scoreCandidate(c, context, weights, settings))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.candidate.distanceKm !== b.candidate.distanceKm) {
        return a.candidate.distanceKm - b.candidate.distanceKm;
      }
      if (b.candidate.ratingAvg !== a.candidate.ratingAvg) {
        return b.candidate.ratingAvg - a.candidate.ratingAvg;
      }
      return a.candidate.providerId.localeCompare(b.candidate.providerId);
    })
    .slice(0, settings.max_providers_per_job);
}

/**
 * Progressive radius expansion: 5 km → 10 km → 20 km. Returns the next step
 * above the current radius, or null once the last step has been tried.
 */
export function nextRadius(currentKm: number, settings: MatchingSettings): number | null {
  const steps = [...settings.radius_steps_km].sort((a, b) => a - b);
  return steps.find((step) => step > currentKm) ?? null;
}

export function firstRadius(settings: MatchingSettings): number {
  return [...settings.radius_steps_km].sort((a, b) => a - b)[0] ?? 5;
}

/** Weights are configurable, so guard against a set that does not sum to 1. */
export function normaliseWeights(weights: MatchWeights): MatchWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return SETTINGS_DEFAULTS.match_weights;
  if (Math.abs(total - 1) < 1e-6) return weights;
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total]),
  ) as MatchWeights;
}
