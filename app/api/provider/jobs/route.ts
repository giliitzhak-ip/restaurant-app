import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider } from '@/lib/api/guards';
import { ACTIVE_STATUSES, OPEN_FOR_OFFERS } from '@/lib/services/jobs/workflow';
import type { JobStatus } from '@/types/database';

const querySchema = z.object({
  feed: z.enum(['available', 'mine', 'history']).default('available'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * GET /api/provider/jobs
 *
 *  - `available`: jobs broadcast to this provider that are still open and that
 *    they have not declined.
 *  - `mine`: jobs currently assigned to them.
 *  - `history`: finished work.
 */
export const GET = route(async (request: NextRequest) => {
  const { supabase, providerId } = await requireProvider();
  const { feed, page, pageSize } = parseQuery(request, querySchema);
  const from = (page - 1) * pageSize;

  if (feed === 'available') {
    const { data, error, count } = await supabase
      .from('job_assignments')
      .select(
        `id, match_score, distance_km, notified_at, viewed_at, declined_at,
         job:jobs!job_assignments_job_id_fkey (
           id, reference, title, description, status, urgency, address, lat, lng,
           budget_min, budget_max, created_at, scheduled_for,
           category:categories (id, name, slug, icon),
           service:services (id, name),
           job_images (id, storage_path, kind)
         )`,
        { count: 'exact' },
      )
      .eq('provider_id', providerId)
      .is('declined_at', null)
      .order('match_score', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw ApiError.badRequest('לא ניתן לטעון עבודות', error.message);

    // Offers already sent should not look like fresh leads.
    const { data: myOffers } = await supabase
      .from('job_offers')
      .select('job_id, status')
      .eq('provider_id', providerId);
    const offeredJobIds = new Set((myOffers ?? []).map((offer) => offer.job_id));

    const assignments = (data ?? []).filter((row) => {
      const job = row.job as { status: string } | null;
      return job && OPEN_FOR_OFFERS.includes(job.status as never);
    });

    return jsonOk({
      assignments: assignments.map((row) => ({
        ...row,
        hasOffer: offeredJobIds.has((row.job as { id: string }).id),
      })),
      total: count ?? 0,
      page,
      pageSize,
    });
  }

  const statuses: JobStatus[] =
    feed === 'mine' ? ACTIVE_STATUSES : ['completed', 'cancelled', 'disputed'];

  const { data, error, count } = await supabase
    .from('jobs')
    .select(
      `id, reference, title, description, status, urgency, address, lat, lng,
       created_at, completed_at, final_price, provider_payout, platform_fee,
       category:categories (id, name, slug, icon),
       customer:users!jobs_customer_id_fkey (id, phone, profiles (full_name, avatar_url))`,
      { count: 'exact' },
    )
    .eq('assigned_provider_id', providerId)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw ApiError.badRequest('לא ניתן לטעון עבודות', error.message);
  return jsonOk({ jobs: data ?? [], total: count ?? 0, page, pageSize });
});
