import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { adminListSchema } from '@/lib/validation/admin';

export const GET = route(async (request: NextRequest) => {
  await requireAdmin();
  const admin = requireServiceClient();
  const { q, role, status, page, pageSize } = parseQuery(request, adminListSchema);

  let query = admin
    .from('users')
    .select('id, email, phone, role, status, status_reason, created_at, profiles (full_name, avatar_url)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (role) query = query.eq('role', role);
  if (status) query = query.eq('status', status as never);
  if (q) query = query.or(`email.ilike.%${q}%,phone.ilike.%${q}%`);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw ApiError.badRequest('לא ניתן לטעון משתמשים', error.message);

  return jsonOk({ users: data ?? [], total: count ?? 0, page, pageSize });
});
