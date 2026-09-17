import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PaymentRow } from '@/types/database';
import { getSetting } from '@/lib/services/settings';
import { calculateFee, type FeeBreakdown } from '@/lib/services/fees';
import { getPaymentAdapter } from './index';
import { ApiError } from '@/lib/api/errors';

/**
 * Money flow, end to end:
 *
 *   customer accepts an offer → authorize (funds held)
 *   → job completed          → capture  (funds taken)
 *   → platform fee recorded  → provider payout amount recorded
 *
 * The amount is always the accepted offer's price read from the database — the
 * client never supplies it — and the split is always recomputed here.
 */
export async function createPaymentForJob(
  supabase: SupabaseClient<Database>,
  params: {
    jobId: string;
    customerId: string;
    providerId: string;
    amount: number;
    categorySlug?: string | null;
    customerEmail?: string | null;
    customerName?: string | null;
    description: string;
  },
): Promise<{ payment: PaymentRow; breakdown: FeeBreakdown; mocked: boolean }> {
  const rules = await getSetting('platform_fee_rules');
  const breakdown = calculateFee(params.amount, rules, {
    categorySlug: params.categorySlug,
    providerId: params.providerId,
  });

  const { data: payment, error } = await supabase
    .from('payments')
    .upsert(
      {
        job_id: params.jobId,
        customer_id: params.customerId,
        provider_id: params.providerId,
        amount: breakdown.amount,
        platform_fee: breakdown.platformFee,
        provider_payout: breakdown.providerPayout,
        currency: breakdown.currency,
        status: 'pending',
        provider_name: getPaymentAdapter().name,
        fee_rule_snapshot: {
          rule: breakdown.rule,
          effective_rate: breakdown.effectiveRate,
          minimum_fee: rules.minimum_fee,
          maximum_fee: rules.maximum_fee,
        } as never,
      },
      { onConflict: 'job_id' },
    )
    .select()
    .single();

  if (error || !payment) {
    throw new ApiError(500, 'לא ניתן ליצור רשומת תשלום', 'payment_create_failed');
  }

  const adapter = getPaymentAdapter();
  const result = await adapter.authorize({
    paymentId: payment.id,
    jobId: params.jobId,
    amount: breakdown.amount,
    currency: breakdown.currency,
    customerEmail: params.customerEmail,
    customerName: params.customerName,
    description: params.description,
  });

  await supabase.from('payment_transactions').insert({
    payment_id: payment.id,
    type: 'authorization',
    amount: breakdown.amount,
    currency: breakdown.currency,
    status: result.ok ? 'authorized' : 'failed',
    external_id: result.externalId,
    raw_response: (result.raw ?? {}) as never,
  });

  const { data: updated } = await supabase
    .from('payments')
    .update({
      status: result.ok ? 'authorized' : 'failed',
      external_id: result.externalId,
      authorized_at: result.ok ? new Date().toISOString() : null,
      failure_reason: result.ok ? null : (result.error ?? 'authorization failed'),
    })
    .eq('id', payment.id)
    .select()
    .single();

  if (!result.ok) {
    throw new ApiError(402, result.error ?? 'התשלום נכשל', 'payment_failed');
  }

  return { payment: updated ?? payment, breakdown, mocked: !adapter.isLive };
}

/** Captures the held funds once the work is done and books the platform fee. */
export async function capturePaymentForJob(
  supabase: SupabaseClient<Database>,
  jobId: string,
  finalAmount?: number,
): Promise<{ payment: PaymentRow; breakdown: FeeBreakdown } | null> {
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (!payment) return null;
  if (payment.status === 'captured') {
    return {
      payment,
      breakdown: {
        amount: Number(payment.amount),
        platformFee: Number(payment.platform_fee),
        providerPayout: Number(payment.provider_payout),
        effectiveRate: Number(payment.platform_fee) / Number(payment.amount),
        rule: { label: 'snapshot', source: 'default', percentage: 0 },
        currency: payment.currency,
      },
    };
  }
  if (payment.status !== 'authorized') {
    throw new ApiError(409, 'התשלום אינו במצב שמאפשר גבייה', 'payment_not_authorized');
  }

  // A final amount may only be lower than the authorised one (e.g. a discount).
  const amount = Math.min(finalAmount ?? Number(payment.amount), Number(payment.amount));
  const rules = await getSetting('platform_fee_rules');
  const breakdown = calculateFee(amount, rules, { providerId: payment.provider_id });

  const adapter = getPaymentAdapter();
  const result = await adapter.capture({
    paymentId: payment.id,
    externalId: payment.external_id,
    amount: breakdown.amount,
    currency: payment.currency,
  });

  await supabase.from('payment_transactions').insert({
    payment_id: payment.id,
    type: 'capture',
    amount: breakdown.amount,
    currency: payment.currency,
    status: result.ok ? 'captured' : 'failed',
    external_id: result.externalId,
    raw_response: (result.raw ?? {}) as never,
  });

  if (!result.ok) {
    await supabase
      .from('payments')
      .update({ failure_reason: result.error ?? 'capture failed' })
      .eq('id', payment.id);
    throw new ApiError(402, result.error ?? 'גביית התשלום נכשלה', 'capture_failed');
  }

  const { data: captured } = await supabase
    .from('payments')
    .update({
      status: 'captured',
      amount: breakdown.amount,
      platform_fee: breakdown.platformFee,
      provider_payout: breakdown.providerPayout,
      captured_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq('id', payment.id)
    .select()
    .single();

  await supabase.from('platform_fees').insert({
    payment_id: payment.id,
    job_id: jobId,
    amount: breakdown.platformFee,
    rate: breakdown.effectiveRate,
    rule_label: breakdown.rule.label,
  });

  await supabase.from('payment_transactions').insert({
    payment_id: payment.id,
    type: 'platform_fee',
    amount: breakdown.platformFee,
    currency: payment.currency,
    status: 'captured',
    raw_response: { rule: breakdown.rule } as never,
  });

  return { payment: captured ?? payment, breakdown };
}

/** Refunds a captured payment, or voids an authorisation. */
export async function refundPaymentForJob(
  supabase: SupabaseClient<Database>,
  jobId: string,
  reason: string,
  amount?: number,
): Promise<PaymentRow | null> {
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (!payment) return null;
  if (payment.status === 'refunded' || payment.status === 'cancelled') return payment;

  const adapter = getPaymentAdapter();
  const refundAmount = Math.min(amount ?? Number(payment.amount), Number(payment.amount));
  const result = await adapter.refund({
    paymentId: payment.id,
    externalId: payment.external_id,
    amount: refundAmount,
    currency: payment.currency,
    reason,
  });

  await supabase.from('payment_transactions').insert({
    payment_id: payment.id,
    type: 'refund',
    amount: refundAmount,
    currency: payment.currency,
    status: result.ok ? 'refunded' : 'failed',
    external_id: result.externalId,
    raw_response: (result.raw ?? {}) as never,
  });

  const { data: refunded } = await supabase
    .from('payments')
    .update({
      status: result.ok ? (payment.status === 'authorized' ? 'cancelled' : 'refunded') : payment.status,
      refunded_at: result.ok ? new Date().toISOString() : null,
      failure_reason: result.ok ? null : (result.error ?? 'refund failed'),
    })
    .eq('id', payment.id)
    .select()
    .single();

  return refunded ?? payment;
}
