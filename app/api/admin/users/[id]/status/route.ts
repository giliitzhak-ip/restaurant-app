import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { updateUserStatusSchema } from '@/lib/validation/admin';

/** PUT /api/admin/users/:id/status — suspend, block or reactivate an account. */
export const PUT = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const input = await parseBody(request, updateUserStatusSchema);

  if (id === session.userId) {
    throw ApiError.badRequest('לא ניתן לשנות את הסטטוס של החשבון שלך');
  }

  const { data, error } = await admin
    .from('users')
    .update({ status: input.status, status_reason: input.reason ?? null })
    .eq('id', id)
    .select('id, status, role')
    .single();

  if (error || !data) throw ApiError.badRequest('עדכון הסטטוס נכשל', error?.message);

  // A blocked or suspended provider must also stop receiving work immediately.
  if (data.role === 'provider' && input.status !== 'active') {
    const { data: provider } = await admin
      .from('provider_profiles')
      .select('id')
      .eq('user_id', id)
      .maybeSingle();
    if (provider) {
      await admin
        .from('provider_availability')
        .upsert({ provider_id: provider.id, is_available: false }, { onConflict: 'provider_id' });
    }
  }

  await logAdminAction(session.userId, 'user_status_change', 'users', id, {
    status: input.status,
    reason: input.reason ?? null,
  });

  return jsonOk({ user: data });
});
