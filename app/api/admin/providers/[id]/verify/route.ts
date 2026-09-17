import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { verifyProviderSchema } from '@/lib/validation/admin';
import { notify } from '@/lib/services/notifications';

/**
 * PUT /api/admin/providers/:id/verify — the manual verification decision.
 *
 * Only an admin reaches this; the provider's own update path cannot touch
 * `status` at all (the database trigger reverts it).
 */
export const PUT = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const input = await parseBody(request, verifyProviderSchema);

  const { data: provider, error } = await admin
    .from('provider_profiles')
    .update({
      status: input.status,
      status_reason: input.reason ?? null,
      verified_at: input.status === 'verified' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('id, user_id, business_name, status')
    .single();

  if (error || !provider) throw ApiError.badRequest('עדכון האימות נכשל', error?.message);

  // Approving the provider also approves their submitted documents;
  // a rejection leaves them pending so they can be replaced.
  if (input.status === 'verified') {
    await admin
      .from('provider_documents')
      .update({ status: 'approved', reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
      .eq('provider_id', id)
      .eq('status', 'pending');
  } else if (input.status !== 'pending') {
    await admin
      .from('provider_availability')
      .upsert({ provider_id: id, is_available: false }, { onConflict: 'provider_id' });
  }

  const { data: contact } = await admin
    .from('users')
    .select('id, email, phone')
    .eq('id', provider.user_id)
    .maybeSingle();

  if (contact && (input.status === 'verified' || input.status === 'rejected')) {
    await notify({
      event: input.status === 'verified' ? 'provider_verified' : 'provider_rejected',
      recipient: { userId: contact.id, email: contact.email, phone: contact.phone },
      url: '/provider',
      template: { reason: input.reason },
      client: admin,
    });
  }

  await logAdminAction(session.userId, 'provider_verification', 'provider_profiles', id, {
    status: input.status,
    reason: input.reason ?? null,
  });

  return jsonOk({ provider });
});
