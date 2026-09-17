import { z } from 'zod';

/**
 * Commission model (spec §28).
 *
 * The MVP default is tiered — 15% up to ₪1,000, 10% above — but that is a
 * ROW in platform_fees, not a constant in code. The architecture supports
 * percentage / fixed / tiered / category override.
 *
 * All money is in AGOROT (integer minor units). Currency is never held in a
 * float: 15% of ₪290 must not depend on binary rounding.
 */

export const percentageFeeSchema = z.object({
  percentage: z.number().min(0).max(100),
  minFee: z.number().int().nonnegative().optional(),
  maxFee: z.number().int().nonnegative().optional(),
});

export const fixedFeeSchema = z.object({
  amount: z.number().int().nonnegative(),
});

export const tieredFeeSchema = z.object({
  tiers: z
    .array(
      z.object({
        /** Upper bound of this tier in agorot; null means "and above". */
        upTo: z.number().int().positive().nullable(),
        percentage: z.number().min(0).max(100),
      }),
    )
    .min(1),
  minFee: z.number().int().nonnegative().optional(),
  maxFee: z.number().int().nonnegative().optional(),
});

export type FeeType = 'percentage' | 'fixed' | 'tiered';

export interface FeeRule {
  readonly id?: string;
  readonly name: string;
  readonly feeType: FeeType;
  readonly categoryId: string | null;
  readonly config: unknown;
  readonly priority: number;
}

export interface FeeBreakdown {
  readonly grossAmount: number;
  readonly platformFee: number;
  readonly providerAmount: number;
  readonly effectivePercentage: number;
  readonly ruleName: string;
  readonly explanation: string;
}

/** Spec §28 default, mirroring the row inserted by migration 0013. */
export const DEFAULT_FEE_RULE: FeeRule = {
  name: 'Default tiered commission',
  feeType: 'tiered',
  categoryId: null,
  config: { tiers: [{ upTo: 100_000, percentage: 15 }, { upTo: null, percentage: 10 }], minFee: 0 },
  priority: 100,
};

/**
 * Apply a fee rule to a gross amount.
 *
 * Tiered rules are applied as a THRESHOLD rate, not progressively: the whole
 * amount is charged at the rate of the tier it falls into. That matches how
 * the commission was specified ("up to ₪1,000 = 15%, above ₪1,000 = 10%")
 * and is what a provider reading the rate expects.
 */
export function calculateFee(grossAmount: number, rule: FeeRule = DEFAULT_FEE_RULE): FeeBreakdown {
  if (!Number.isInteger(grossAmount) || grossAmount < 0) {
    throw new Error(`Gross amount must be a non-negative integer in agorot, got ${grossAmount}`);
  }

  let platformFee: number;
  let explanation: string;

  switch (rule.feeType) {
    case 'fixed': {
      const config = fixedFeeSchema.parse(rule.config);
      platformFee = Math.min(config.amount, grossAmount);
      explanation = `עמלה קבועה של ${(platformFee / 100).toFixed(2)} ₪`;
      break;
    }
    case 'percentage': {
      const config = percentageFeeSchema.parse(rule.config);
      platformFee = Math.round((grossAmount * config.percentage) / 100);
      platformFee = applyBounds(platformFee, config.minFee, config.maxFee);
      explanation = `${config.percentage}% מסך העבודה`;
      break;
    }
    case 'tiered': {
      const config = tieredFeeSchema.parse(rule.config);
      const sorted = [...config.tiers].sort((a, b) => {
        if (a.upTo === null) return 1;
        if (b.upTo === null) return -1;
        return a.upTo - b.upTo;
      });
      const tier = sorted.find((t) => t.upTo === null || grossAmount <= t.upTo) ?? sorted.at(-1);
      if (!tier) throw new Error('Tiered fee rule has no applicable tier');

      platformFee = Math.round((grossAmount * tier.percentage) / 100);
      platformFee = applyBounds(platformFee, config.minFee, config.maxFee);
      explanation =
        tier.upTo === null
          ? `${tier.percentage}% (מעל ${((sorted.at(-2)?.upTo ?? 0) / 100).toFixed(0)} ₪)`
          : `${tier.percentage}% (עד ${(tier.upTo / 100).toFixed(0)} ₪)`;
      break;
    }
  }

  platformFee = Math.min(platformFee, grossAmount);
  const providerAmount = grossAmount - platformFee;

  return {
    grossAmount,
    platformFee,
    providerAmount,
    effectivePercentage:
      grossAmount === 0 ? 0 : Math.round((platformFee / grossAmount) * 10_000) / 100,
    ruleName: rule.name,
    explanation,
  };
}

function applyBounds(fee: number, min?: number, max?: number): number {
  let result = fee;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
}

/**
 * Pick the rule that applies to a category: the most specific match wins,
 * then the lowest priority number (spec §28 category override).
 */
export function selectFeeRule(
  rules: readonly FeeRule[],
  categoryId: string | null,
): FeeRule {
  const applicable = rules
    .filter((r) => r.categoryId === null || r.categoryId === categoryId)
    .sort((a, b) => {
      const aSpecific = a.categoryId === categoryId && categoryId !== null ? 0 : 1;
      const bSpecific = b.categoryId === categoryId && categoryId !== null ? 0 : 1;
      if (aSpecific !== bSpecific) return aSpecific - bSpecific;
      return a.priority - b.priority;
    });

  return applicable[0] ?? DEFAULT_FEE_RULE;
}

/** ₪ → agorot. */
export function shekelsToAgorot(shekels: number): number {
  return Math.round(shekels * 100);
}

/** agorot → ₪. */
export function agorotToShekels(agorot: number): number {
  return Math.round(agorot) / 100;
}
