import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { cancelJobSchema } from '@/lib/validation/jobs';
import { canActorTransition, cancellationFee } from '@/lib/services/jobs/workflow';
import { getSetting } from '@/lib/services/settings';
import { refundPaymentForJob } from '@/lib/services/payments/flow';
import { notify } from '@/lib/services/notifications';
import type { ActorType } from '@/types/database';

/**
 * POST /api/jobs/:id/cancel
 *
 * Either side may cancel while the job is live. The reason is recorded, any
 * authorisation is released, and the cancellation fee is computed server-side
 * from the admin-configured policy.
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, cancelJobSchema);
  const admin = requireServiceClient();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, customer_id, assigned_provider_id, final_price, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (!job) throw ApiError.notFound('העבודה לא נמצאה');

  const actor: ActorType =
    session.role === 'admin' ? 'admin' : job.customer_id === session.userId ? 'customer' : 'provider';

  if (actor === 'provider' && job.assigned_provider_id !== session.providerId) {
    throw ApiError.forbidden('העבודה אינה משויכת אליך');
  }
  if (!canActorTransition(job.status, 'cancelled', actor)) {
    throw ApiError.unprocessable('לא ניתן לבטל את העבודה במצב הנוכחי');
  }

  const policy = await getSetting('cancellation');
  const minutesSinceSelection = Math.max(
    0,
    (Date.now() - new Date(job.updated_at).getTime()) / 60_000,
  );
  const fee =
    actor === 'customer'
      ? cancellationFee(job.status, job.final_price === null ? null : Number(job.final_price), minutesSinceSelection, policy)
      : 0;

  const { data: updated, error } = await admin
    .from('jobs')
    .update({
      status: 'cancelled',
      cancelled_by: actor,
      cancellation_reason: input.reason,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', job.status)
    .select()
    .single();

  if (error || !updated) throw ApiError.conflict('הביטול נכשל. רענן ונסה שוב.');

  await admin
    .from('job_offers')
    .update({ status: 'rejected' })
    .eq('job_id', id)
    .eq('status', 'pending');

  // Release the hold. A cancellation fee, when one applies, is settled
  // separately — the authorisation itself is never partially captured here.
  await refundPaymentForJob(admin, id, `cancelled_by_${actor}: ${input.reason}`);

  const otherPartyId =
    actor === 'customer'
      ? job.assigned_provider_id
        ? (
            await admin
              .from('provider_profiles')
              .select('user_id')
              .eq('id', job.assigned_provider_id)
              .maybeSingle()
          ).data?.user_id
        : null
      : job.customer_id;

  if (otherPartyId) {
    const { data: contact } = await admin
      .from('users')
      .select('id, email, phone')
      .eq('id', otherPartyId)
      .maybeSingle();

    if (contact) {
      await notify({
        event: 'job_cancelled',
        recipient: { userId: contact.id, email: contact.email, phone: contact.phone },
        jobId: id,
        url: actor === 'customer' ? `/provider/jobs/${id}` : `/app/jobs/${id}`,
        template: { jobTitle: job.title, reason: input.reason },
        urgent: true,
        client: admin,
      });
    }
  }

  return jsonOk({ job: updated, cancellationFee: fee });
});
