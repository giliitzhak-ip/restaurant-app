import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { getPaymentAdapter } from '@/lib/services/payments';
import { findTopup, settleTopup } from '@/lib/services/billing/topup';
import { getServiceSupabase } from '@/lib/supabase/server';
import type { PaymentStatus } from '@/types/database';

const STATUS_BY_EVENT: Record<string, PaymentStatus> = {
  'payment_intent.amount_capturable_updated': 'authorized',
  'payment_intent.succeeded': 'captured',
  'payment_intent.payment_failed': 'failed',
  'payment_intent.canceled': 'cancelled',
  'charge.refunded': 'refunded',
  authorized: 'authorized',
  captured: 'captured',
  failed: 'failed',
  refunded: 'refunded',
};

/**
 * POST /api/payments/webhook
 *
 * Asynchronous status updates for provider top-ups — the only charges GET
 * SERVICE makes. A job's own payment never reaches a gateway, so nothing here
 * can touch a job.
 *
 * The adapter verifies the signature; an unverified payload is rejected
 * outright rather than trusted, because this endpoint is necessarily public.
 * Crediting is idempotent in `settleTopup`, which is what makes a replayed
 * delivery harmless rather than free money.
 */
export const POST = route(async (request: NextRequest) => {
  const rawBody = await request.text();
  const signature =
    request.headers.get('stripe-signature') ?? request.headers.get('x-payment-signature');

  const adapter = getPaymentAdapter();
  const event = await adapter.parseWebhook(rawBody, signature);

  if (!event) {
    throw ApiError.badRequest('חתימת ה-webhook אינה תקפה');
  }

  const supabase = getServiceSupabase();
  if (!supabase) throw ApiError.serviceUnavailable('מסד הנתונים לא מוגדר');

  const status = STATUS_BY_EVENT[event.type];
  if (!status) return jsonOk({ ignored: event.type });

  const topup = await findTopup(supabase, {
    paymentId: event.paymentId,
    externalId: event.externalId,
  });
  if (!topup) return jsonOk({ ignored: 'unknown_topup' });

  if (status === 'authorized' || status === 'captured') {
    const settled = await settleTopup(supabase, topup.id);
    return jsonOk({ topup: settled.id, status: settled.status });
  }

  await supabase
    .from('provider_topups')
    .update({
      status,
      ...(status === 'failed' ? { failure_reason: `webhook: ${event.type}` } : {}),
    })
    .eq('id', topup.id);

  return jsonOk({ topup: topup.id, status });
});
