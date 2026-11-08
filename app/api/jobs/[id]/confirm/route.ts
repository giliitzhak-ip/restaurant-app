import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { confirmJobSchema } from '@/lib/validation/jobs';
import { isPriceGapFlagged, priceGap } from '@/lib/services/jobs/verification';
import { refundCommission } from '@/lib/services/billing/ledger';
import { getSetting } from '@/lib/services/settings';
import { notify } from '@/lib/services/notifications';
import { formatPrice } from '@/lib/utils/format';

/**
 * POST /api/jobs/:id/confirm — the customer's account of what happened.
 *
 * This is the supervision the platform actually has. It does not gate a
 * payment, because the platform holds none; it decides two things:
 *
 *   `happened: true`  — the job counts. Reputation updates, the commission
 *                       stays, and a price well off the agreed one is flagged.
 *   `happened: false` — the booking produced nothing. The commission goes back
 *                       to the provider's balance and a dispute is opened, so
 *                       neither side is left arguing with a database.
 *
 * Only the customer on the job may call it, and only once.
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, confirmJobSchema);
  const admin = requireServiceClient();

  const { data: job } = await supabase
    .from('jobs')
    .select(
      `id, reference, title, status, customer_id, assigned_provider_id, final_price,
       commission_amount, commission_charged_at, commission_refunded_at,
       customer_confirmed_at, arrival_verified_at`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!job) throw ApiError.notFound('העבודה לא נמצאה');
  if (job.customer_id !== session.userId) {
    throw ApiError.forbidden('רק הלקוח שפתח את הבקשה יכול לאשר אותה');
  }
  if (job.customer_confirmed_at) {
    throw ApiError.conflict('העבודה כבר אושרה');
  }
  if (!['completed', 'in_progress', 'arrived', 'disputed'].includes(job.status)) {
    throw ApiError.unprocessable('אין מה לאשר בשלב הזה');
  }

  const verification = await getSetting('verification');
  const confirmedAt = new Date().toISOString();
  const agreed = job.final_price === null ? null : Number(job.final_price);
  const reported = input.reportedPrice ?? null;

  if (!input.happened) {
    return jsonOk(await reportNoShow());
  }

  const { data: updated, error } = await admin
    .from('jobs')
    .update({
      customer_confirmed_at: confirmedAt,
      customer_confirmed_by: session.userId,
      customer_reported_price: reported,
      // Confirming an unfinished job finishes it: the customer saying the work
      // is done is a stronger signal than the provider not having said so.
      ...(job.status === 'completed' ? {} : { status: 'completed', completed_at: confirmedAt }),
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) throw ApiError.badRequest('אישור העבודה נכשל');

  const flagged = isPriceGapFlagged(agreed, reported, verification);

  if (flagged) {
    // Not an accusation and not an automatic refund — a price well off what was
    // agreed is simply worth a human looking at, with the numbers attached.
    await admin.from('disputes').insert({
      job_id: id,
      opened_by: session.userId,
      opened_by_type: 'customer',
      reason: 'price',
      description:
        `המחיר שדווח (${formatPrice(reported)}) שונה מהמחיר שסוכם (${formatPrice(agreed)}).` +
        (input.note ? ` הערת הלקוח: ${input.note}` : ''),
      status: 'open',
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
        event: 'job_confirmed',
        recipient: {
          userId: provider.user_id,
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
        },
        jobId: id,
        url: `/provider/jobs/${id}`,
        template: { jobTitle: job.title, customerName: session.fullName },
        client: admin,
      });
    }
  }

  return jsonOk({
    job: updated,
    confirmed: true,
    priceGap: priceGap(agreed, reported),
    flaggedForReview: flagged,
  });

  /**
   * The customer says it never happened.
   *
   * The commission comes back regardless of who is right: the platform charged
   * for an introduction that produced nothing, and holding the money while a
   * dispute runs would make the provider pay for the argument. If the dispute
   * then finds the job did happen, an admin adjustment puts it back.
   */
  async function reportNoShow() {
    const refund = await refundCommission(admin, {
      job: {
        id: job!.id,
        reference: job!.reference,
        assigned_provider_id: job!.assigned_provider_id,
        commission_amount: job!.commission_amount,
        commission_charged_at: job!.commission_charged_at,
        commission_refunded_at: job!.commission_refunded_at,
      },
      cancelledBy: 'customer',
      neverHappened: true,
      actorUserId: session.userId,
      reasonNote: input.note ?? null,
    });

    const { data: dispute } = await admin
      .from('disputes')
      .insert({
        job_id: id,
        opened_by: session.userId,
        opened_by_type: 'customer',
        reason: 'not_performed',
        description: input.note?.trim() || 'הלקוח מדווח שהעבודה לא בוצעה.',
        status: 'open',
      })
      .select('id')
      .maybeSingle();

    await admin
      .from('jobs')
      .update({ status: 'disputed', customer_reported_price: reported })
      .eq('id', id);

    if (job!.assigned_provider_id && refund.entry) {
      const { data: provider } = await admin
        .from('provider_profiles')
        .select('user_id, users:users!provider_profiles_user_id_fkey (email, phone)')
        .eq('id', job!.assigned_provider_id)
        .maybeSingle();

      if (provider) {
        const contact = provider.users as { email: string | null; phone: string | null } | null;
        await notify({
          event: 'commission_refunded',
          recipient: {
            userId: provider.user_id,
            email: contact?.email ?? null,
            phone: contact?.phone ?? null,
          },
          jobId: id,
          url: `/provider/balance`,
          template: {
            commission: formatPrice(Number(job!.commission_amount ?? 0)),
            reason: refund.decision.reason,
          },
          client: admin,
        });
      }
    }

    return {
      confirmed: false,
      disputeId: dispute?.id ?? null,
      commissionRefunded: refund.decision.refund,
      message: 'הדיווח נרשם ונפתחה בדיקה. העמלה שנגבתה מבעל המקצוע הוחזרה בינתיים.',
    };
  }
});
