import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { adminListSchema } from '@/lib/validation/admin';

export const GET = route(async (request: NextRequest) => {
  await requireAdmin();
  const admin = requireServiceClient();
  const { status, page, pageSize } = parseQuery(request, adminListSchema);

  let query = admin
    .from('reviews')
    .select(
      `id, rating, comment, is_hidden, hidden_reason, flagged, created_at,
       job:jobs (id, reference, title),
       provider:provider_profiles (id, business_name)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (status === 'flagged') query = query.eq('flagged', true);
  if (status === 'hidden') query = query.eq('is_hidden', true);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw ApiError.badRequest('לא ניתן לטעון דירוגים', error.message);

  return jsonOk({ reviews: data ?? [], total: count ?? 0, page, pageSize });
});
