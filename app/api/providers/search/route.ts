import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession } from '@/lib/api/guards';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { searchProvidersSchema } from '@/lib/validation/providers';
import { haversineKm, estimateEtaMinutes } from '@/lib/utils/geo';

/**
 * GET /api/providers/search — the customer-facing directory.
 *
 * Distance filtering and "recommended" ordering are computed here rather than
 * in SQL because the caller may not supply a location at all. The match
 * engine's internal score is never exposed; "recommended" is presented as a
 * blend the customer does not see the formula for.
 */
export const GET = route(async (request: NextRequest) => {
  const { session, supabase } = await requireSession();
  checkRateLimit(`search:${session.userId}`, RATE_LIMITS.search);

  const filters = parseQuery(request, searchProvidersSchema);

  let query = supabase
    .from('provider_profiles')
    .select(
      `id, business_name, owner_name, avatar_url, bio, years_experience, base_price,
       rating_avg, rating_count, completed_jobs, avg_response_seconds, status,
       provider_categories (category_id, categories (id, name, slug, icon)),
       provider_availability (is_available),
       service_areas (center_lat, center_lng, radius_km)`,
      { count: 'exact' },
    )
    .eq('status', 'verified');

  if (filters.q) {
    query = query.ilike('business_name', `%${filters.q}%`);
  }
  if (filters.minRating) {
    query = query.gte('rating_avg', filters.minRating);
  }
  if (filters.maxPrice) {
    query = query.lte('base_price', filters.maxPrice);
  }

  const { data, error } = await query.limit(200);
  if (error) throw ApiError.badRequest('החיפוש נכשל', error.message);

  const origin =
    filters.lat !== undefined && filters.lng !== undefined
      ? { lat: filters.lat, lng: filters.lng }
      : null;

  type Row = NonNullable<typeof data>[number];

  const enriched = (data ?? [])
    .map((provider: Row) => {
      const areas = provider.service_areas ?? [];
      const distanceKm = origin
        ? areas.reduce<number | null>((nearest, area) => {
            const distance = haversineKm(origin, { lat: area.center_lat, lng: area.center_lng });
            return nearest === null || distance < nearest ? distance : nearest;
          }, null)
        : null;

      const availability = provider.provider_availability as { is_available: boolean } | null;

      return {
        id: provider.id,
        businessName: provider.business_name,
        ownerName: provider.owner_name,
        avatarUrl: provider.avatar_url,
        bio: provider.bio,
        yearsExperience: provider.years_experience,
        basePrice: provider.base_price === null ? null : Number(provider.base_price),
        ratingAvg: Number(provider.rating_avg ?? 0),
        ratingCount: provider.rating_count ?? 0,
        completedJobs: provider.completed_jobs ?? 0,
        avgResponseSeconds: provider.avg_response_seconds,
        isAvailable: availability?.is_available ?? false,
        isVerified: true,
        categories: (provider.provider_categories ?? [])
          .map((link) => (link.categories as { id: string; name: string; slug: string } | null))
          .filter((category): category is { id: string; name: string; slug: string } => Boolean(category)),
        distanceKm,
        etaMinutes: distanceKm === null ? null : estimateEtaMinutes(distanceKm),
      };
    })
    .filter((provider) => {
      if (filters.categoryId && !provider.categories.some((c) => c.id === filters.categoryId)) {
        return false;
      }
      if (filters.availableOnly && !provider.isAvailable) return false;
      if (
        filters.maxDistanceKm !== undefined &&
        provider.distanceKm !== null &&
        provider.distanceKm > filters.maxDistanceKm
      ) {
        return false;
      }
      return true;
    });

  enriched.sort((a, b) => {
    switch (filters.sort) {
      case 'distance':
        return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      case 'rating':
        return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
      case 'price':
        return (a.basePrice ?? Infinity) - (b.basePrice ?? Infinity);
      case 'response_time':
        return (a.avgResponseSeconds ?? Infinity) - (b.avgResponseSeconds ?? Infinity);
      default: {
        // "Recommended": availability first, then reputation, then proximity.
        const score = (p: (typeof enriched)[number]) =>
          (p.isAvailable ? 1 : 0) * 2 +
          p.ratingAvg / 5 +
          Math.min(1, p.completedJobs / 50) -
          Math.min(1, (p.distanceKm ?? 20) / 40);
        return score(b) - score(a);
      }
    }
  });

  const from = (filters.page - 1) * filters.pageSize;
  return jsonOk({
    providers: enriched.slice(from, from + filters.pageSize),
    total: enriched.length,
    page: filters.page,
    pageSize: filters.pageSize,
  });
});
