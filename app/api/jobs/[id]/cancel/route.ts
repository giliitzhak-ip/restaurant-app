import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { cancelJobSchema } from '@/lib/validation/jobs';
import { canActorTransition, cancellationFee } from '@/lib/services/jobs/workflow';
import { getSetting } from '@/lib/services/settings';
import { refundCommission } from '@/lib/services/billing/ledger';
import { notify } from '@/lib/services/notifications';
import { formatPrice } from '@/lib/utils/format';
import type { ActorType } from '@/types/database';

/**
 * POST /api/jobs/:id/cancel
 *
 * Either side may cancel while the job is live. The reason is recorded and the
 * cancellation fee is computed server-side from the admin-configured policy.
 *
 * The commission is the interesting part. It was charged when the offer was
 * accepted, before any work, so a cancellation has to be able to reverse it or
 * the platform is charging for bookings that never happened. The policy —
 * refund when the customer walked away, keep the charge when the provider did —
 * lives in `refundDecision`, and the asymmetry is deliberate: it is what makes
 * charging at acceptance fair rather than merely early.
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, cancelJobSchema);
  const admin = requireServiceClient();

  const { data: job } = await supabase
    .from('jobs')
    .select(
      `id, reference, title, status, customer_id, assigned_provider_id, final_price, updated_at,
       commission_amount, commission_charged_at, commission_refunded_at`,
    )
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

  const refund = await refundCommission(admin, {
    job: {
      id: job.id,
      reference: job.reference,
      assigned_provider_id: job.assigned_provider_id,
      commission_amount: job.commission_amount,
      commission_charged_at: job.commission_charged_at,
      commission_refunded_at: job.commission_refunded_at,
    },
    cancelledBy: actor,
    actorUserId: session.userId,
    reasonNote: input.reason,
  });

  if (refund.entry && job.assigned_provider_id) {
    const { data: provider } = await admin
      .from('provider_profiles')
      .select('user_id, users:users!provider_profiles_user_id_fkey (email, phone)')
      .eq('id', job.assigned_provider_id)
      .maybeSingle();

    if (provider) {
      const providerContact = provider.users as { email: string | null; phone: string | null } | null;
      await notify({
        event: 'commission_refunded',
        recipient: {
          userId: provider.user_id,
          email: providerContact?.email ?? null,
          phone: providerContact?.phone ?? null,
        },
        jobId: id,
        url: '/provider/balance',
        template: {
          commission: formatPrice(Number(job.commission_amount ?? 0)),
          reason: refund.decision.reason,
        },
        client: admin,
      });
    }
  }

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

  return jsonOk({
    job: updated,
    cancellationFee: fee,
    // Only the provider's own client renders this; the customer has no stake in
    // the commission and is never shown it.
    commission:
      actor === 'provider' || actor === 'admin'
        ? { refunded: refund.decision.refund, reason: refund.decision.reason }
        : undefined,
  });
});
