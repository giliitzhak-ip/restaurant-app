import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, JobRow, NearbyProviderRow } from '@/types/database';
import { getServiceSupabase } from '@/lib/supabase/server';
import { getSetting } from '@/lib/services/settings';
import { normaliseWeights, rankCandidates, firstRadius, nextRadius } from './engine';
import type { MatchCandidate, ScoredCandidate } from './types';

export interface DiscoveryResult {
  /** The radius that produced the shortlist. */
  radiusKm: number;
  shortlist: ScoredCandidate[];
  /** True when every radius step was exhausted and we still fell short. */
  exhausted: boolean;
}

function toCandidate(row: NearbyProviderRow): MatchCandidate {
  return {
    providerId: row.provider_id,
    userId: row.user_id,
    businessName: row.business_name,
    ownerName: row.owner_name,
    avatarUrl: row.avatar_url,
    distanceKm: Number(row.distance_km ?? 0),
    isAvailable: row.is_available,
    locationAgeSeconds: row.location_age_seconds,
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: row.rating_count ?? 0,
    completedJobs: row.completed_jobs ?? 0,
    cancelledJobs: row.cancelled_jobs ?? 0,
    avgResponseSeconds: row.avg_response_seconds,
    servesArea: row.serves_area,
    matchesService: row.matches_service,
    basePrice: row.base_price === null ? null : Number(row.base_price),
    yearsExperience: row.years_experience ?? 0,
    // `find_nearby_providers` only returns verified providers.
    isVerified: true,
  };
}

/**
 * Finds providers for a job, widening the search radius step by step until the
 * shortlist is big enough (5 km → 10 km → 20 km by default).
 *
 * Runs with the service role: discovery must see providers the customer has no
 * right to query directly, and must write `job_assignments`, which is exactly
 * the table RLS uses to decide what a provider is allowed to see.
 */
export async function discoverProviders(
  job: Pick<
    JobRow,
    'id' | 'category_id' | 'service_id' | 'lat' | 'lng' | 'urgency' | 'budget_min' | 'budget_max' | 'customer_id'
  >,
  client?: SupabaseClient<Database>,
): Promise<DiscoveryResult> {
  const supabase = client ?? getServiceSupabase();
  if (!supabase) {
    return { radiusKm: 0, shortlist: [], exhausted: true };
  }

  const [weightsRaw, matching] = await Promise.all([
    getSetting('match_weights'),
    getSetting('matching'),
  ]);
  const weights = normaliseWeights(weightsRaw);

  const { data: favoriteRows } = await supabase
    .from('favorites')
    .select('provider_id')
    .eq('customer_id', job.customer_id);
  const favoriteProviderIds = (favoriteRows ?? []).map((row) => row.provider_id);

  let radiusKm = firstRadius(matching);
  let shortlist: ScoredCandidate[] = [];
  let exhausted = false;

  for (;;) {
    const { data, error } = await supabase.rpc('find_nearby_providers', {
      category_id: job.category_id,
      latitude: job.lat,
      longitude: job.lng,
      radius_km: radiusKm,
      service_id: job.service_id,
      max_results: Math.max(matching.max_providers_per_job * 4, 40),
    });

    if (error) {
      throw new Error(`Provider discovery failed: ${error.message}`);
    }

    const candidates = (data ?? []).map(toCandidate);
    shortlist = rankCandidates(
      candidates,
      {
        categoryId: job.category_id,
        serviceId: job.service_id,
        urgency: job.urgency,
        budgetMin: job.budget_min,
        budgetMax: job.budget_max,
        favoriteProviderIds,
        searchRadiusKm: radiusKm,
      },
      weights,
      matching,
    );

    if (shortlist.length >= matching.minimum_providers) break;

    const wider = nextRadius(radiusKm, matching);
    if (wider === null || wider > matching.max_distance_km) {
      exhausted = true;
      break;
    }
    radiusKm = wider;
  }

  return { radiusKm, shortlist, exhausted };
}

/**
 * Persists the shortlist. `job_assignments` is the RLS gate for providers, so
 * writing it is what actually grants a provider sight of the job.
 */
export async function broadcastJob(
  jobId: string,
  result: DiscoveryResult,
  client?: SupabaseClient<Database>,
): Promise<string[]> {
  const supabase = client ?? getServiceSupabase();
  if (!supabase || result.shortlist.length === 0) return [];

  const rows = result.shortlist.map((entry) => ({
    job_id: jobId,
    provider_id: entry.candidate.providerId,
    match_score: entry.score,
    distance_km: Math.round(entry.candidate.distanceKm * 100) / 100,
    score_breakdown: entry.breakdown as never,
    notified_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('job_assignments')
    .upsert(rows, { onConflict: 'job_id,provider_id', ignoreDuplicates: true });
  if (error) throw new Error(`Broadcast failed: ${error.message}`);

  await supabase
    .from('jobs')
    .update({
      status: 'searching',
      search_radius_km: result.radiusKm,
      broadcast_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'requested');

  return result.shortlist.map((entry) => entry.candidate.userId);
}
