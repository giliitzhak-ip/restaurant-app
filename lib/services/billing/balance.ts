import { SETTINGS_DEFAULTS } from '@/lib/services/settings/defaults';
import type { ActorType } from '@/types/database';
import type { BillingSettings } from '@/lib/services/settings/schema';

/**
 * Prepaid balance rules.
 *
 * GET SERVICE takes its commission the moment an offer is accepted, out of
 * credit the provider has already bought. Nothing in a job's own payment runs
 * through the platform — the customer pays the provider directly.
 *
 * The consequence worth stating plainly: enforcement is access control, not
 * debt collection. A provider with no credit is not in arrears, they simply
 * stop receiving work, which is a state this module computes rather than a
 * process anyone has to chase.
 *
 * Pure functions only — no database, no `server-only`, so the simulator and
 * the tests can run them as-is.
 */

export type BalanceState =
  /** Enough credit for the work in hand. */
  | 'ok'
  /** Still accepting work, but close enough to the floor to warn about. */
  | 'low'
  /** At or under the floor: no new work until topped up. */
  | 'blocked';

export interface BalanceStatus {
  balance: number;
  state: BalanceState;
  canAcceptWork: boolean;
  /** Credit to add before work resumes (0 when none is needed). */
  shortfall: number;
  /** The commission this status was computed against, when one was given. */
  pendingCharge: number | null;
  minimumBalance: number;
  lowBalanceThreshold: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Whether a provider can take on work, and what it would take to unblock them.
 *
 * `nextCharge` is the commission on a specific offer. Pass it when the question
 * is "can this provider accept *this* job" — a balance that clears the floor in
 * general can still be too thin for one large job.
 */
export function balanceStatus(
  balance: number,
  billing: BillingSettings = SETTINGS_DEFAULTS.billing,
  nextCharge?: number,
): BalanceStatus {
  const minimum = billing.minimum_balance;
  const charge = typeof nextCharge === 'number' && nextCharge > 0 ? round2(nextCharge) : null;
  const required = round2(minimum + (charge ?? 0));
  const current = round2(balance);

  const canAcceptWork = current >= required;
  const shortfall = canAcceptWork ? 0 : round2(required - current);

  let state: BalanceState;
  if (!canAcceptWork) {
    state = 'blocked';
  } else if (current <= round2(minimum + billing.low_balance_threshold)) {
    state = 'low';
  } else {
    state = 'ok';
  }

  return {
    balance: current,
    state,
    canAcceptWork,
    shortfall,
    pendingCharge: charge,
    minimumBalance: minimum,
    lowBalanceThreshold: billing.low_balance_threshold,
  };
}

export interface RefundDecision {
  refund: boolean;
  /** Why, in Hebrew — shown to the provider on the ledger row. */
  reason: string;
  code:
    | 'customer_cancelled'
    | 'provider_cancelled'
    | 'never_happened'
    | 'admin'
    | 'window_expired'
    | 'policy_off'
    | 'already_refunded';
}

/**
 * Whether a commission charge comes back.
 *
 * The charge lands before the work does, so a booking that falls through has to
 * be reversible or the model is just a fee for nothing. The default policy
 * refunds when the customer walked away and keeps the charge when the provider
 * did — that asymmetry is the whole point of charging at acceptance.
 */
export function refundDecision(params: {
  cancelledBy: ActorType | null;
  chargedAt: Date | string;
  alreadyRefunded?: boolean;
  /** Set when the evidence says the job never took place. */
  neverHappened?: boolean;
  now?: Date;
  billing?: BillingSettings;
}): RefundDecision {
  const billing = params.billing ?? SETTINGS_DEFAULTS.billing;
  const now = params.now ?? new Date();

  if (params.alreadyRefunded) {
    return { refund: false, reason: 'העמלה כבר הוחזרה', code: 'already_refunded' };
  }

  const chargedAt = new Date(params.chargedAt);
  const hoursSince = (now.getTime() - chargedAt.getTime()) / 3_600_000;
  const withinWindow = hoursSince <= billing.refund_window_hours;

  // An admin ruling and a job proven not to have happened are not bounded by
  // the automatic window: both are decisions, not defaults.
  if (params.neverHappened) {
    return { refund: true, reason: 'אין עדות לביצוע העבודה', code: 'never_happened' };
  }
  if (params.cancelledBy === 'admin') {
    return { refund: true, reason: 'ביטול על ידי הנהלת הפלטפורמה', code: 'admin' };
  }

  if (!withinWindow) {
    return {
      refund: false,
      reason: `חלון ההחזר (${billing.refund_window_hours} שעות) חלף`,
      code: 'window_expired',
    };
  }

  if (params.cancelledBy === 'customer' || params.cancelledBy === 'system') {
    return billing.refund_on_customer_cancellation
      ? { refund: true, reason: 'העבודה בוטלה על ידי הלקוח', code: 'customer_cancelled' }
      : { refund: false, reason: 'המדיניות אינה מחזירה עמלה בביטול לקוח', code: 'policy_off' };
  }

  if (params.cancelledBy === 'provider') {
    return billing.refund_on_provider_cancellation
      ? { refund: true, reason: 'העבודה בוטלה על ידי בעל המקצוע', code: 'provider_cancelled' }
      : {
          refund: false,
          reason: 'ביטול מצד בעל המקצוע אינו מזכה בהחזר עמלה',
          code: 'provider_cancelled',
        };
  }

  return { refund: false, reason: 'אין סיבת ביטול מזוהה', code: 'policy_off' };
}

/** The smallest preset that clears a shortfall, for the top-up screen. */
export function suggestedTopup(
  shortfall: number,
  billing: BillingSettings = SETTINGS_DEFAULTS.billing,
): number {
  const presets = [...billing.topup_presets].sort((a, b) => a - b);
  return presets.find((preset) => preset >= shortfall) ?? presets[presets.length - 1];
}
