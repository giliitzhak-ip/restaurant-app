import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ProviderTopupRow } from '@/types/database';
import { getPaymentAdapter } from '@/lib/services/payments';
import { ApiError } from '@/lib/api/errors';

/**
 * Buying credit.
 *
 * This is the only card charge GET SERVICE makes, and the provider is the
 * payer. A job's own money never passes through here — the customer settles
 * with the provider directly, which is what keeps the platform out of the
 * payment path entirely.
 *
 * The charge is authorised and captured in one step: there is nothing to hold
 * funds for, the credit is delivered immediately.
 */

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface TopupStart {
  topup: ProviderTopupRow;
  /** Set when the gateway needs the provider to complete a hosted step. */
  redirectUrl?: string;
  /** True while no real gateway is configured; the UI says so plainly. */
  mocked: boolean;
}

export async function startTopup(
  service: SupabaseClient<Database>,
  params: {
    providerId: string;
    amount: number;
    providerEmail?: string | null;
    providerName?: string | null;
    returnUrl?: string;
  },
): Promise<TopupStart> {
  const amount = round2(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('סכום הטעינה חייב להיות חיובי');
  }

  const adapter = getPaymentAdapter();

  const { data: topup, error } = await service
    .from('provider_topups')
    .insert({
      provider_id: params.providerId,
      amount,
      currency: 'ILS',
      status: 'pending',
      gateway: adapter.name,
    })
    .select()
    .single();

  if (error || !topup) {
    throw new ApiError(500, 'לא ניתן לפתוח בקשת טעינה', 'topup_create_failed');
  }

  const result = await adapter.authorize({
    paymentId: topup.id,
    amount,
    currency: 'ILS',
    customerEmail: params.providerEmail,
    customerName: params.providerName,
    description: `טעינת יתרה — GET SERVICE`,
    returnUrl: params.returnUrl,
    metadata: { kind: 'provider_topup', provider_id: params.providerId },
  });

  if (!result.ok) {
    await service
      .from('provider_topups')
      .update({ status: 'failed', failure_reason: result.error ?? 'authorization failed' })
      .eq('id', topup.id);
    throw new ApiError(402, result.error ?? 'הטעינה נכשלה', 'topup_failed');
  }

  const { data: authorized } = await service
    .from('provider_topups')
    .update({ status: 'authorized', external_id: result.externalId, failure_reason: null })
    .eq('id', topup.id)
    .select()
    .single();

  const current = authorized ?? topup;

  // A gateway that redirects finishes through the webhook instead.
  if (result.redirectUrl) {
    return { topup: current, redirectUrl: result.redirectUrl, mocked: !adapter.isLive };
  }

  const settled = await settleTopup(service, current.id);
  return { topup: settled, mocked: !adapter.isLive };
}

/**
 * Captures an authorised top-up and credits the balance.
 *
 * Idempotent by `balance_entry_id`: a webhook delivered twice, or a redirect the
 * provider reloads, finds the credit already written and does nothing. That
 * check is the only thing standing between a retried delivery and free credit,
 * so it comes first.
 */
export async function settleTopup(
  service: SupabaseClient<Database>,
  topupId: string,
): Promise<ProviderTopupRow> {
  const { data: topup } = await service
    .from('provider_topups')
    .select('*')
    .eq('id', topupId)
    .maybeSingle();

  if (!topup) throw ApiError.notFound('בקשת הטעינה לא נמצאה');
  if (topup.balance_entry_id) return topup;
  if (topup.status === 'refunded' || topup.status === 'cancelled' || topup.status === 'failed') {
    return topup;
  }

  const adapter = getPaymentAdapter();
  const capture = await adapter.capture({
    paymentId: topup.id,
    externalId: topup.external_id,
    amount: Number(topup.amount),
    currency: topup.currency,
  });

  if (!capture.ok) {
    await service
      .from('provider_topups')
      .update({ status: 'failed', failure_reason: capture.error ?? 'capture failed' })
      .eq('id', topup.id);
    throw new ApiError(402, capture.error ?? 'גביית הטעינה נכשלה', 'topup_capture_failed');
  }

  const { data: entry, error: entryError } = await service
    .from('balance_entries')
    .insert({
      provider_id: topup.provider_id,
      type: 'topup',
      amount: Number(topup.amount),
      balance_after: 0,
      description: `טעינת יתרה (${topup.gateway})`,
      external_id: capture.externalId ?? topup.external_id,
    })
    .select()
    .single();

  if (entryError || !entry) {
    throw new ApiError(500, 'הטעינה נגבתה אך זקיפת היתרה נכשלה', 'topup_credit_failed');
  }

  const { data: captured } = await service
    .from('provider_topups')
    .update({
      status: 'captured',
      external_id: capture.externalId ?? topup.external_id,
      balance_entry_id: entry.id,
      captured_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq('id', topup.id)
    .select()
    .single();

  return captured ?? topup;
}

/** Finds the top-up a webhook refers to, by our id or the gateway's. */
export async function findTopup(
  service: SupabaseClient<Database>,
  reference: { paymentId?: string | null; externalId?: string | null },
): Promise<ProviderTopupRow | null> {
  if (reference.paymentId) {
    const { data } = await service
      .from('provider_topups')
      .select('*')
      .eq('id', reference.paymentId)
      .maybeSingle();
    if (data) return data;
  }
  if (reference.externalId) {
    const { data } = await service
      .from('provider_topups')
      .select('*')
      .eq('external_id', reference.externalId)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}
