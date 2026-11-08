import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { completeJobSchema } from '@/lib/validation/jobs';
import { canActorTransition } from '@/lib/services/jobs/workflow';
import { verificationState } from '@/lib/services/jobs/verification';
import { getSetting } from '@/lib/services/settings';
import { notify } from '@/lib/services/notifications';
import { formatPrice } from '@/lib/utils/format';
import type { ActorType } from '@/types/database';

/**
 * POST /api/jobs/:id/complete
 *
 * Marks the work done. No money moves here — the commission was taken when the
 * offer was accepted, and the customer pays the provider directly for the work
 * itself. What this route does instead is collect evidence and ask the customer
 * to confirm, which is what later justifies keeping the commission or giving it
 * back.
 *
 * `finalPrice` is recorded for the record and for the price-gap check; it can
 * only be lower than the agreed price, so a provider cannot restate the job as
 * larger after the fact.
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, completeJobSchema);
  const admin = requireServiceClient();

  const { data: job } = await supabase
    .from('jobs')
    .select(
      `id, title, status, customer_id, assigned_provider_id, final_price, commission_amount,
       arrival_verified_at`,
    )
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

  const verification = await getSetting('verification');

  if (verification.require_completion_photo && actor === 'provider' && input.evidence.length === 0) {
    throw ApiError.badRequest('צרף תמונה אחת לפחות מסיום העבודה');
  }

  // A final price may only reduce the agreed amount — never raise it.
  const agreed = job.final_price === null ? undefined : Number(job.final_price);
  if (input.finalPrice !== undefined && agreed !== undefined && input.finalPrice > agreed) {
    throw ApiError.badRequest('לא ניתן לעדכן מחיר גבוה מהמחיר שסוכם');
  }

  const completedAt = new Date().toISOString();

  const { data: updated, error } = await admin
    .from('jobs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      ...(input.finalPrice !== undefined ? { final_price: input.finalPrice } : {}),
    })
    .eq('id', id)
    .eq('status', job.status)
    .select()
    .single();

  if (error || !updated) throw ApiError.conflict('סיום העבודה נכשל. רענן ונסה שוב.');

  if (input.evidence.length > 0) {
    await admin.from('job_images').insert(
      input.evidence.map((file, index) => ({
        job_id: id,
        storage_path: file.storagePath,
        kind: file.kind,
        stage: 'completion' as const,
        sort_order: index,
      })),
    );
  }

  const state = verificationState(
    {
      arrivalVerifiedAt: job.arrival_verified_at,
      completionPhotos: input.evidence.length,
      customerConfirmedAt: null,
      completedAt,
    },
    verification,
  );

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
      template: {
        jobTitle: job.title,
        price: formatPrice(input.finalPrice ?? agreed ?? null),
      },
      client: admin,
    });

    // Confirmation is a separate, explicit ask. Bundling it into the
    // completion notice is how it gets ignored.
    if (verification.require_customer_confirmation) {
      await notify({
        event: 'confirmation_requested',
        recipient: { userId: customer.id, email: customer.email, phone: customer.phone },
        jobId: id,
        url: `/app/jobs/${id}?confirm=1`,
        template: { jobTitle: job.title, providerName: session.fullName },
        client: admin,
      });
    }
  }

  return jsonOk({
    job: updated,
    // What the provider owes and what they collect are two different things,
    // and the response says both so the app never has to guess.
    settlement: {
      collectFromCustomer: input.finalPrice ?? agreed ?? null,
      commissionAlreadyPaid: job.commission_amount === null ? null : Number(job.commission_amount),
      note: 'את התשלום על העבודה אתה גובה ישירות מהלקוח. העמלה נגבתה מהיתרה בעת קבלת העבודה.',
    },
    verification: {
      level: state.level,
      missing: state.missing,
      awaitingCustomerConfirmation: verification.require_customer_confirmation,
      autoConfirmAfterHours: verification.auto_confirm_after_hours,
    },
  });
});
