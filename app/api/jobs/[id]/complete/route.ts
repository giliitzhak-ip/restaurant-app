import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { completeJobSchema } from '@/lib/validation/jobs';
import { canActorTransition } from '@/lib/services/jobs/workflow';
import { capturePaymentForJob } from '@/lib/services/payments/flow';
import { notify } from '@/lib/services/notifications';
import { formatPrice } from '@/lib/utils/format';
import type { ActorType } from '@/types/database';

/**
 * POST /api/jobs/:id/complete
 *
 * Marks the work done and captures the held payment in the same request, so a
 * job can never end up completed-but-unpaid or paid-but-unfinished.
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, completeJobSchema);
  const admin = requireServiceClient();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, customer_id, assigned_provider_id, final_price')
    .eq('id', id)
    .maybeSingle();

  if (!job) throw ApiError.notFound('העבודה לא נמצאה');

  const actor: ActorType =
    session.role === 'admin' ? 'admin' : job.customer_id === session.userId ? 'customer' : 'provider';

  if (actor === 'provider' && job.assigned_provider_id !== session.providerId) {
    throw ApiError.forbidden('העבודה אינה משויכת אליך');
  }
  if (!canActorTransition(job.status, 'completed', actor)) {
    throw ApiError.unprocessable('לא ניתן לסמן את העבודה כהושלמה במצב הנוכחי');
  }

  // A final price may only reduce the agreed amount — never raise it.
  const agreed = job.final_price === null ? undefined : Number(job.final_price);
  if (input.finalPrice !== undefined && agreed !== undefined && input.finalPrice > agreed) {
    throw ApiError.badRequest('לא ניתן לחייב מעבר למחיר שסוכם');
  }

  const capture = await capturePaymentForJob(admin, id, input.finalPrice);

  const { data: updated, error } = await admin
    .from('jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      ...(capture
        ? {
            final_price: capture.breakdown.amount,
            platform_fee: capture.breakdown.platformFee,
            provider_payout: capture.breakdown.providerPayout,
          }
        : {}),
    })
    .eq('id', id)
    .eq('status', job.status)
    .select()
    .single();

  if (error || !updated) throw ApiError.conflict('סיום העבודה נכשל. רענן ונסה שוב.');

  const { data: customer } = await admin
    .from('users')
    .select('id, email, phone')
    .eq('id', job.customer_id)
    .maybeSingle();

  if (customer) {
    await notify({
      event: 'job_completed',
      recipient: { userId: customer.id, email: customer.email, phone: customer.phone },
      jobId: id,
      url: `/app/jobs/${id}?review=1`,
      template: { jobTitle: job.title, price: formatPrice(capture?.breakdown.amount ?? null) },
      client: admin,
    });
  }

  if (job.assigned_provider_id) {
    const { data: provider } = await admin
      .from('provider_profiles')
      .select('user_id, users:users!provider_profiles_user_id_fkey (email, phone)')
      .eq('id', job.assigned_provider_id)
      .maybeSingle();

    if (provider) {
      const contact = provider.users as { email: string | null; phone: string | null } | null;
      await notify({
        event: 'payment_completed',
        recipient: {
          userId: provider.user_id,
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
        },
        jobId: id,
        url: `/provider/earnings`,
        template: { price: formatPrice(capture?.breakdown.providerPayout ?? null) },
        client: admin,
      });
    }
  }

  return jsonOk({
    job: updated,
    payment: capture
      ? {
          amount: capture.breakdown.amount,
          platformFee: capture.breakdown.platformFee,
          providerPayout: capture.breakdown.providerPayout,
          status: capture.payment.status,
        }
      : null,
  });
});
