import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorType, BalanceEntryRow, Database, JobRow } from '@/types/database';
import { getSetting } from '@/lib/services/settings';
import { calculateFee, type FeeBreakdown } from '@/lib/services/fees';
import { ApiError } from '@/lib/api/errors';
import { balanceStatus, refundDecision, type BalanceStatus, type RefundDecision } from './balance';

/**
 * The commission ledger.
 *
 * Append-only: a correction is a new entry, never an edit, and the database
 * refuses UPDATE and DELETE outright. `provider_profiles.balance` is a cache of
 * the running total, maintained by a trigger — nothing here writes it directly.
 *
 * Every function takes a service-role client. Callers must have established
 * authorisation first; these writes are platform-owned and bypass RLS.
 */

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Current balance plus whether it is enough for a specific commission. */
export async function getBalanceStatus(
  service: SupabaseClient<Database>,
  providerId: string,
  nextCharge?: number,
): Promise<BalanceStatus> {
  const [{ data: provider }, billing] = await Promise.all([
    service.from('provider_profiles').select('balance').eq('id', providerId).maybeSingle(),
    getSetting('billing'),
  ]);

  if (!provider) throw new ApiError(404, 'בעל המקצוע לא נמצא', 'provider_not_found');
  return balanceStatus(Number(provider.balance), billing, nextCharge);
}

/** What accepting this offer would cost the provider, without charging it. */
export async function quoteCommission(
  amount: number,
  context: { providerId: string; categorySlug?: string | null },
): Promise<FeeBreakdown> {
  const rules = await getSetting('platform_fee_rules');
  return calculateFee(amount, rules, {
    providerId: context.providerId,
    categorySlug: context.categorySlug,
  });
}

export interface CommissionCharge {
  entry: BalanceEntryRow;
  breakdown: FeeBreakdown;
  balanceAfter: number;
}

/**
 * Charges the commission for a job and stamps it on the job row.
 *
 * Called at offer acceptance — the one moment both sides have committed and the
 * platform knows the agreed price. The amount comes from the accepted offer in
 * the database, never from the client, and the split is recomputed here.
 *
 * The job's unique index means a second call for the same job cannot double
 * charge; it returns the existing entry instead.
 */
export async function chargeCommission(
  service: SupabaseClient<Database>,
  params: {
    jobId: string;
    providerId: string;
    /** The accepted offer's price, read from the database. */
    amount: number;
    categorySlug?: string | null;
    jobReference?: string | null;
  },
): Promise<CommissionCharge> {
  const existing = await service
    .from('balance_entries')
    .select('*')
    .eq('job_id', params.jobId)
    .eq('type', 'commission')
    .maybeSingle();

  const breakdown = await quoteCommission(params.amount, {
    providerId: params.providerId,
    categorySlug: params.categorySlug,
  });

  if (existing.data) {
    return {
      entry: existing.data,
      breakdown,
      balanceAfter: Number(existing.data.balance_after),
    };
  }

  const status = await getBalanceStatus(service, params.providerId, breakdown.platformFee);
  if (!status.canAcceptWork) {
    throw new ApiError(
      402,
      `היתרה אינה מספיקה לקבלת העבודה. חסרים ₪${status.shortfall.toFixed(2)}.`,
      'insufficient_balance',
      { shortfall: status.shortfall, balance: status.balance, commission: breakdown.platformFee },
    );
  }

  const { data: entry, error } = await service
    .from('balance_entries')
    .insert({
      provider_id: params.providerId,
      type: 'commission',
      amount: -breakdown.platformFee,
      // Overwritten by the trigger; sent only to satisfy the NOT NULL column.
      balance_after: 0,
      job_id: params.jobId,
      description: params.jobReference
        ? `עמלה על עבודה ${params.jobReference}`
        : 'עמלה על קבלת עבודה',
      rule_snapshot: {
        rule: breakdown.rule,
        job_amount: breakdown.amount,
        effective_rate: breakdown.effectiveRate,
      } as never,
    })
    .select()
    .single();

  if (error || !entry) {
    // The floor check lives in the trigger, so a race that the pre-check let
    // through still lands here rather than overdrawing the balance.
    if (error?.message?.includes('insufficient balance')) {
      throw new ApiError(402, 'היתרה אינה מספיקה לקבלת העבודה', 'insufficient_balance');
    }
    throw new ApiError(500, 'לא ניתן לחייב את העמלה', 'commission_charge_failed');
  }

  await service
    .from('jobs')
    .update({
      commission_amount: breakdown.platformFee,
      commission_charged_at: entry.created_at,
      final_price: breakdown.amount,
      platform_fee: breakdown.platformFee,
      provider_payout: breakdown.providerPayout,
    })
    .eq('id', params.jobId);

  return { entry, breakdown, balanceAfter: Number(entry.balance_after) };
}

export interface CommissionRefund {
  decision: RefundDecision;
  entry: BalanceEntryRow | null;
}

/**
 * Returns a commission when the booking fell through.
 *
 * The policy decision is `refundDecision`'s; this only carries it out. A job
 * that was never charged, or was already refunded, is a no-op — cancellation
 * routes call this unconditionally so they do not have to know either way.
 */
export async function refundCommission(
  service: SupabaseClient<Database>,
  params: {
    job: Pick<
      JobRow,
      | 'id'
      | 'reference'
      | 'assigned_provider_id'
      | 'commission_amount'
      | 'commission_charged_at'
      | 'commission_refunded_at'
    >;
    cancelledBy: ActorType | null;
    neverHappened?: boolean;
    /** Set for an admin ruling; recorded as the entry's author. */
    actorUserId?: string | null;
    reasonNote?: string | null;
  },
): Promise<CommissionRefund> {
  const { job } = params;

  if (!job.assigned_provider_id || !job.commission_charged_at || !job.commission_amount) {
    return {
      decision: { refund: false, reason: 'לא נגבתה עמלה על העבודה', code: 'policy_off' },
      entry: null,
    };
  }

  const billing = await getSetting('billing');
  const decision = refundDecision({
    cancelledBy: params.cancelledBy,
    chargedAt: job.commission_charged_at,
    alreadyRefunded: Boolean(job.commission_refunded_at),
    neverHappened: params.neverHappened,
    billing,
  });

  if (!decision.refund) return { decision, entry: null };

  const amount = round2(Number(job.commission_amount));
  const { data: entry, error } = await service
    .from('balance_entries')
    .insert({
      provider_id: job.assigned_provider_id,
      type: 'commission_refund',
      amount,
      balance_after: 0,
      job_id: job.id,
      description: `${decision.reason} — החזר עמלה על ${job.reference}`,
      created_by: params.actorUserId ?? null,
      rule_snapshot: {
        code: decision.code,
        cancelled_by: params.cancelledBy,
        note: params.reasonNote ?? null,
      } as never,
    })
    .select()
    .single();

  // A unique index allows one refund per job; a second attempt is harmless.
  if (error) {
    return {
      decision: { refund: false, reason: 'העמלה כבר הוחזרה', code: 'already_refunded' },
      entry: null,
    };
  }

  await service
    .from('jobs')
    .update({ commission_refunded_at: entry.created_at })
    .eq('id', job.id);

  return { decision, entry };
}

/**
 * An admin correction, in either direction.
 *
 * Deliberately separate from the automatic paths: it is the only way credit
 * moves without either a card charge or a job, and every row records who did it.
 */
export async function adjustBalance(
  service: SupabaseClient<Database>,
  params: { providerId: string; amount: number; reason: string; adminUserId: string },
): Promise<BalanceEntryRow> {
  if (!Number.isFinite(params.amount) || params.amount === 0) {
    throw new ApiError(400, 'סכום התיאום חייב להיות שונה מאפס', 'invalid_amount');
  }

  const { data: entry, error } = await service
    .from('balance_entries')
    .insert({
      provider_id: params.providerId,
      type: 'adjustment',
      amount: round2(params.amount),
      balance_after: 0,
      description: params.reason,
      created_by: params.adminUserId,
    })
    .select()
    .single();

  if (error || !entry) {
    throw new ApiError(500, 'לא ניתן לעדכן את היתרה', 'adjustment_failed');
  }
  return entry;
}

/** The provider's own ledger, newest first. */
export async function listEntries(
  service: SupabaseClient<Database>,
  providerId: string,
  limit = 50,
): Promise<BalanceEntryRow[]> {
  const { data } = await service
    .from('balance_entries')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}
