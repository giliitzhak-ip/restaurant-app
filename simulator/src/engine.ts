import {
  firstRadius,
  nextRadius,
  rankCandidates,
} from '@/lib/services/matching/engine';
import type { MatchJobContext, ScoredCandidate } from '@/lib/services/matching/types';
import type { MatchWeights, MatchingSettings } from '@/lib/services/settings/schema';
import { PROVIDERS, toCandidate } from './world';
import type { LatLng } from '@/lib/utils/geo';

/**
 * Discovery, run in the browser.
 *
 * `discoverProviders` in the app does exactly this against Supabase: it calls
 * the `find_nearby_providers` SQL function for the current radius, then hands
 * the pool to `rankCandidates`. The SQL cannot run here, so the filter below
 * reproduces its WHERE clause — verified provider, matching category, inside
 * the radius or covered by a declared service area. The ranking that follows
 * is not reproduced: it is the application's own `rankCandidates`, imported.
 */

export interface DiscoveryStep {
  radiusKm: number;
  /** Rows the SQL filter would have returned at this radius. */
  poolSize: number;
  /** Rows the engine kept after ranking and trimming. */
  shortlistSize: number;
  enough: boolean;
}

export interface DiscoveryRun {
  steps: DiscoveryStep[];
  radiusKm: number;
  shortlist: ScoredCandidate[];
  exhausted: boolean;
}

export interface DiscoveryInput {
  categorySlug: string;
  serviceSlug: string | null;
  location: LatLng;
  context: Omit<MatchJobContext, 'searchRadiusKm'>;
  weights: MatchWeights;
  matching: MatchingSettings;
}

export function runDiscovery(input: DiscoveryInput): DiscoveryRun {
  const { categorySlug, serviceSlug, location, context, weights, matching } = input;

  const steps: DiscoveryStep[] = [];
  let radiusKm = firstRadius(matching);
  let shortlist: ScoredCandidate[] = [];
  let exhausted = false;

  for (;;) {
    // The `find_nearby_providers` WHERE clause, in memory.
    const pool = PROVIDERS.filter((provider) => provider.isVerified)
      .filter((provider) => provider.categorySlugs.includes(categorySlug))
      .map((provider) => toCandidate(provider, location, serviceSlug))
      .filter((candidate) => candidate.distanceKm <= radiusKm || candidate.servesArea);

    shortlist = rankCandidates(pool, { ...context, searchRadiusKm: radiusKm }, weights, matching);

    const enough = shortlist.length >= matching.minimum_providers;
    steps.push({ radiusKm, poolSize: pool.length, shortlistSize: shortlist.length, enough });

    if (enough) break;

    const wider = nextRadius(radiusKm, matching);
    if (wider === null || wider > matching.max_distance_km) {
      exhausted = true;
      break;
    }
    radiusKm = wider;
  }

  return { steps, radiusKm, shortlist, exhausted };
}

/** Re-ranks an existing pool at a fixed radius — used when weights change. */
export function rerank(
  input: Omit<DiscoveryInput, 'matching'> & { matching: MatchingSettings; radiusKm: number },
): ScoredCandidate[] {
  const { categorySlug, serviceSlug, location, context, weights, matching, radiusKm } = input;

  const pool = PROVIDERS.filter((provider) => provider.isVerified)
    .filter((provider) => provider.categorySlugs.includes(categorySlug))
    .map((provider) => toCandidate(provider, location, serviceSlug))
    .filter((candidate) => candidate.distanceKm <= radiusKm || candidate.servesArea);

  return rankCandidates(pool, { ...context, searchRadiusKm: radiusKm }, weights, matching);
}
