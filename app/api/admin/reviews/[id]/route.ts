import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { moderateReviewSchema } from '@/lib/validation/admin';

/**
 * PUT /api/admin/reviews/:id — moderation.
 *
 * A review is never deleted: hiding it keeps the record while removing it from
 * the provider's public profile and from their rating average (the database
 * trigger recomputes the average over visible reviews only).
 */
export const PUT = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const input = await parseBody(request, moderateReviewSchema);

  const { data, error } = await admin
    .from('reviews')
    .update({
      is_hidden: input.isHidden,
      hidden_reason: input.isHidden ? (input.reason ?? null) : null,
      hidden_by: input.isHidden ? session.userId : null,
      flagged: false,
    })
    .eq('id', id)
    .select('id, is_hidden, provider_id')
    .single();

  if (error || !data) throw ApiError.badRequest('עדכון הביקורת נכשל', error?.message);

  await logAdminAction(session.userId, 'review_moderation', 'reviews', id, {
    hidden: input.isHidden,
    reason: input.reason ?? null,
  });

  return jsonOk({ review: data });
});
