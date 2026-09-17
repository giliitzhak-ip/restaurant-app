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
    .from('provider_profiles')
    .select(
      `id, user_id, business_name, owner_name, phone, email, status, status_reason,
       rating_avg, rating_count, completed_jobs, cancelled_jobs, onboarding_completed,
       created_at, verified_at,
       provider_categories (categories (name)),
       provider_documents (id, doc_type, status, file_name, storage_path, created_at)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status as never);
  if (q) query = query.ilike('business_name', `%${q}%`);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw ApiError.badRequest('לא ניתן לטעון בעלי מקצוע', error.message);

  return jsonOk({ providers: data ?? [], total: count ?? 0, page, pageSize });
});
