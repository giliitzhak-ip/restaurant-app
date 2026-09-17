import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { getPaymentAdapter } from '@/lib/services/payments';
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
 * Asynchronous status updates from the payment provider. The adapter verifies
 * the signature; an unverified payload is rejected outright rather than
 * trusted, because this endpoint is necessarily public.
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

  const query = supabase.from('payments').update({
    status,
    ...(status === 'captured' ? { captured_at: new Date().toISOString() } : {}),
    ...(status === 'refunded' ? { refunded_at: new Date().toISOString() } : {}),
  });

  const { data, error } = event.paymentId
    ? await query.eq('id', event.paymentId).select('id').maybeSingle()
    : await query.eq('external_id', event.externalId ?? '').select('id').maybeSingle();

  if (error) throw ApiError.badRequest('עדכון התשלום נכשל', error.message);
  if (!data) return jsonOk({ ignored: 'unknown_payment' });

  await supabase.from('payment_transactions').insert({
    payment_id: data.id,
    type: status === 'refunded' ? 'refund' : status === 'captured' ? 'capture' : 'authorization',
    amount: 0,
    status,
    external_id: event.externalId,
    raw_response: { webhook: event.type } as never,
  });

  return jsonOk({ updated: data.id, status });
});
