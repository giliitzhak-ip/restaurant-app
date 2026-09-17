import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession } from '@/lib/api/guards';

const DETAIL_SELECT = `
  *,
  category:categories (id, name, slug, icon),
  service:services (id, name, slug),
  customer:users!jobs_customer_id_fkey (id, phone, profiles (full_name, avatar_url)),
  assigned_provider:provider_profiles (
    id, business_name, owner_name, avatar_url, phone, rating_avg, rating_count, completed_jobs
  ),
  job_images (id, storage_path, kind, sort_order),
  job_status_history (id, from_status, to_status, actor_type, note, created_at)
`;

/**
 * GET /api/jobs/:id
 *
 * No ownership filter is applied here on purpose — Row Level Security decides
 * what the caller may read: their own job as a customer, or a job broadcast to
 * them as a provider. A row the caller cannot see simply comes back empty.
 */
export const GET = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { supabase } = await requireSession();

  const { data: job, error } = await supabase
    .from('jobs')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw ApiError.badRequest('לא ניתן לטעון את העבודה', error.message);
  if (!job) throw ApiError.notFound('העבודה לא נמצאה');

  const { data: offers } = await supabase
    .from('job_offers')
    .select(
      `id, price, eta_minutes, note, status, valid_until, distance_km, created_at,
       provider:provider_profiles (
         id, business_name, avatar_url, rating_avg, rating_count, completed_jobs, status
       )`,
    )
    .eq('job_id', id)
    .order('created_at', { ascending: false });

  const { data: payment } = await supabase
    .from('payments')
    .select('id, amount, platform_fee, provider_payout, status, currency, captured_at')
    .eq('job_id', id)
    .maybeSingle();

  const { data: review } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, is_hidden')
    .eq('job_id', id)
    .maybeSingle();

  return jsonOk({ job, offers: offers ?? [], payment, review });
});
