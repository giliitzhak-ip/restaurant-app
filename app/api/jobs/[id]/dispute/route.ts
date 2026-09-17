import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { createDisputeSchema } from '@/lib/validation/jobs';
import type { ActorType } from '@/types/database';

/** POST /api/jobs/:id/dispute — either party escalates a job to the team. */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, createDisputeSchema);

  const { data: job } = await supabase
    .from('jobs')
    .select('id, reference, status, customer_id, assigned_provider_id')
    .eq('id', id)
    .maybeSingle();

  if (!job) throw ApiError.notFound('העבודה לא נמצאה');

  const openedByType: ActorType =
    session.role === 'admin' ? 'admin' : job.customer_id === session.userId ? 'customer' : 'provider';

  if (openedByType === 'provider' && job.assigned_provider_id !== session.providerId) {
    throw ApiError.forbidden('העבודה אינה משויכת אליך');
  }

  const { data: existing } = await supabase
    .from('disputes')
    .select('id')
    .eq('job_id', id)
    .in('status', ['open', 'under_review'])
    .maybeSingle();

  if (existing) throw ApiError.conflict('כבר קיימת תלונה פתוחה על העבודה הזו');

  const { data: dispute, error } = await supabase
    .from('disputes')
    .insert({
      job_id: id,
      opened_by: session.userId,
      opened_by_type: openedByType,
      reason: input.reason,
      description: input.description,
      status: 'open',
    })
    .select()
    .single();

  if (error || !dispute) throw ApiError.badRequest('פתיחת התלונה נכשלה', error?.message);

  // A disputed job leaves the normal flow; only an admin can move it on.
  const admin = requireServiceClient();
  if (job.status !== 'cancelled') {
    await admin.from('jobs').update({ status: 'disputed' }).eq('id', id);
  }

  return jsonOk({ dispute }, 201);
});
