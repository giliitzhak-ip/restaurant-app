import { SETTINGS_DEFAULTS, type PlatformFeeRules } from '@/lib/services/settings/schema';

export interface FeeBreakdown {
  /** What the customer agreed to pay the provider. */
  amount: number;
  /** GET SERVICE commission, already clamped by min/max. */
  platformFee: number;
  /** What the provider receives. Always `amount - platformFee`. */
  providerPayout: number;
  /** Effective rate after clamping, for display and auditing. */
  effectiveRate: number;
  /** The rule that produced this split — stored on the payment row. */
  rule: {
    label: string;
    source: 'provider_override' | 'category_override' | 'tier' | 'default';
    percentage: number;
  };
  currency: string;
}

export interface FeeContext {
  categorySlug?: string | null;
  providerId?: string | null;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Resolves which commission percentage applies, in precedence order:
 * provider override → category override → amount tier → default.
 *
 * A provider can never influence this: overrides are admin-managed settings,
 * and the fee is always recomputed server-side from the agreed amount.
 */
export function resolveFeeRule(
  amount: number,
  rules: PlatformFeeRules,
  context: FeeContext = {},
): FeeBreakdown['rule'] {
  const { providerId, categorySlug } = context;

  if (providerId && rules.provider_overrides[providerId] !== undefined) {
    return {
      label: `עמלה מותאמת לבעל מקצוע`,
      source: 'provider_override',
      percentage: rules.provider_overrides[providerId],
    };
  }

  if (categorySlug && rules.category_overrides[categorySlug] !== undefined) {
    return {
      label: `עמלת קטגוריה: ${categorySlug}`,
      source: 'category_override',
      percentage: rules.category_overrides[categorySlug],
    };
  }

  const tier = rules.tiers.find(
    (t) => amount >= t.min_amount && (t.max_amount === null || amount <= t.max_amount),
  );
  if (tier) {
    return { label: tier.label, source: 'tier', percentage: tier.percentage };
  }

  return { label: 'עמלת ברירת מחדל', source: 'default', percentage: rules.default_percentage };
}

/**
 * Splits a job amount into platform fee and provider payout.
 * The two parts always add back up to `amount` exactly (to the agora), which
 * the `payments_split_balances` database constraint also enforces.
 */
export function calculateFee(
  amount: number,
  rules: PlatformFeeRules = SETTINGS_DEFAULTS.platform_fee_rules,
  context: FeeContext = {},
): FeeBreakdown {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Fee calculation requires a positive amount.');
  }

  const rule = resolveFeeRule(amount, rules, context);

  let fee = round2(amount * rule.percentage);
  if (rules.minimum_fee > 0) fee = Math.max(fee, rules.minimum_fee);
  if (rules.maximum_fee !== null && rules.maximum_fee !== undefined) {
    fee = Math.min(fee, rules.maximum_fee);
  }
  // A fee may never exceed the job itself.
  fee = round2(Math.min(fee, amount));

  const providerPayout = round2(amount - fee);

  return {
    amount: round2(amount),
    platformFee: fee,
    providerPayout,
    effectiveRate: round2(fee / amount * 10000) / 10000,
    rule,
    currency: rules.currency,
  };
}

/**
 * What the customer sees before confirming. The customer pays the agreed price;
 * the commission is taken out of the provider's side, so `total === amount`.
 * Kept as its own function so a future "customer-side service fee" model can be
 * introduced without touching the provider payout maths.
 */
export function customerPriceBreakdown(breakdown: FeeBreakdown) {
  return {
    jobPrice: breakdown.amount,
    serviceFee: 0,
    total: breakdown.amount,
    currency: breakdown.currency,
  };
}

/** What the provider sees: gross, commission, net. */
export function providerPriceBreakdown(breakdown: FeeBreakdown) {
  return {
    gross: breakdown.amount,
    platformFee: breakdown.platformFee,
    net: breakdown.providerPayout,
    rate: breakdown.effectiveRate,
    currency: breakdown.currency,
  };
}
