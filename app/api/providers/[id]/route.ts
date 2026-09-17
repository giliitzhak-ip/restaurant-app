import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { getServerSupabase } from '@/lib/supabase/server';

/**
 * GET /api/providers/:id — the public provider profile.
 *
 * Deliberately omits verification documents and contact details: those are
 * private and, for documents, unreachable through RLS anyway.
 */
export const GET = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const supabase = await getServerSupabase();
  if (!supabase) throw ApiError.serviceUnavailable('מסד הנתונים לא מוגדר');

  const { data: provider, error } = await supabase
    .from('provider_profiles')
    .select(
      `id, business_name, owner_name, avatar_url, logo_url, bio, years_experience,
       base_price, rating_avg, rating_count, completed_jobs, status, created_at,
       provider_categories (categories (id, name, slug, icon)),
       provider_services (price_from, services (id, name, slug)),
       service_areas (label, radius_km),
       provider_availability (is_available),
       provider_gallery (id, storage_path, caption, sort_order)`,
    )
    .eq('id', id)
    .eq('status', 'verified')
    .maybeSingle();

  if (error) throw ApiError.badRequest('לא ניתן לטעון את הפרופיל', error.message);
  if (!provider) throw ApiError.notFound('בעל המקצוע לא נמצא');

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, review_categories (criterion, score)')
    .eq('provider_id', id)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(20);

  return jsonOk({ provider, reviews: reviews ?? [] });
});
