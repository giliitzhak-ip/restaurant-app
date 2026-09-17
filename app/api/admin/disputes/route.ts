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
    .from('disputes')
    .select(
      `id, reason, description, status, resolution, opened_by_type, created_at, resolved_at,
       job:jobs (id, reference, title, final_price, status)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status as never);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw ApiError.badRequest('לא ניתן לטעון תלונות', error.message);

  return jsonOk({ disputes: data ?? [], total: count ?? 0, page, pageSize });
});
