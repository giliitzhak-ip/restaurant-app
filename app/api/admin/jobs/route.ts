import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { adminListSchema } from '@/lib/validation/admin';

export const GET = route(async (request: NextRequest) => {
  await requireAdmin();
  const admin = requireServiceClient();
  const { q, status, page, pageSize } = parseQuery(request, adminListSchema);

  let query = admin
    .from('jobs')
    .select(
      `id, reference, title, status, urgency, address, created_at, completed_at,
       final_price, platform_fee, provider_payout, cancelled_by, cancellation_reason,
       category:categories (name, slug),
       assigned_provider:provider_profiles (id, business_name)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status as never);
  if (q) query = query.or(`reference.ilike.%${q}%,title.ilike.%${q}%`);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw ApiError.badRequest('לא ניתן לטעון עבודות', error.message);

  return jsonOk({ jobs: data ?? [], total: count ?? 0, page, pageSize });
});
