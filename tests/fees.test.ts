import { describe, expect, it } from 'vitest';
import {
  calculateFee,
  customerPriceBreakdown,
  providerPriceBreakdown,
  resolveFeeRule,
} from '@/lib/services/fees';
import { SETTINGS_DEFAULTS, type PlatformFeeRules } from '@/lib/services/settings/schema';

const rules = SETTINGS_DEFAULTS.platform_fee_rules;

describe('platform fee calculation', () => {
  it('applies the low tier below ₪1,000', () => {
    const breakdown = calculateFee(500, rules);
    expect(breakdown.rule.percentage).toBe(0.15);
    expect(breakdown.platformFee).toBe(75);
    expect(breakdown.providerPayout).toBe(425);
  });

  it('applies the high tier from ₪1,000 up', () => {
    const breakdown = calculateFee(1000, rules);
    expect(breakdown.rule.percentage).toBe(0.1);
    expect(breakdown.platformFee).toBe(100);
    expect(breakdown.providerPayout).toBe(900);
  });

  it('never lets fee and payout drift from the total', () => {
    for (const amount of [80, 123.45, 999, 1000, 4321.99, 25_000]) {
      const breakdown = calculateFee(amount, rules);
      expect(breakdown.platformFee + breakdown.providerPayout).toBeCloseTo(breakdown.amount, 2);
    }
  });

  it('clamps to the configured minimum fee', () => {
    // 15% of ₪80 is ₪12, below the ₪15 floor.
    const breakdown = calculateFee(80, rules);
    expect(breakdown.platformFee).toBe(15);
    expect(breakdown.providerPayout).toBe(65);
  });

  it('clamps to the configured maximum fee', () => {
    const breakdown = calculateFee(50_000, rules);
    expect(breakdown.platformFee).toBe(rules.maximum_fee);
    expect(breakdown.providerPayout).toBe(50_000 - (rules.maximum_fee ?? 0));
  });

  it('prefers a provider override over a category override or tier', () => {
    const custom: PlatformFeeRules = {
      ...rules,
      category_overrides: { plumbing: 0.2 },
      provider_overrides: { 'provider-1': 0.05 },
    };

    expect(
      resolveFeeRule(500, custom, { providerId: 'provider-1', categorySlug: 'plumbing' }).source,
    ).toBe('provider_override');
    expect(resolveFeeRule(500, custom, { categorySlug: 'plumbing' }).source).toBe(
      'category_override',
    );
    expect(resolveFeeRule(500, custom, {}).source).toBe('tier');
  });

  it('falls back to the default percentage when no tier matches', () => {
    const noTiers: PlatformFeeRules = { ...rules, tiers: [] };
    expect(resolveFeeRule(500, noTiers, {}).source).toBe('default');
    expect(resolveFeeRule(500, noTiers, {}).percentage).toBe(noTiers.default_percentage);
  });

  it('rejects a non-positive amount rather than inventing a split', () => {
    expect(() => calculateFee(0, rules)).toThrow();
    expect(() => calculateFee(-10, rules)).toThrow();
  });

  it('shows the customer the agreed price with no hidden markup', () => {
    const breakdown = calculateFee(1000, rules);
    const customer = customerPriceBreakdown(breakdown);
    expect(customer.jobPrice).toBe(1000);
    expect(customer.serviceFee).toBe(0);
    expect(customer.total).toBe(1000);
  });

  it('shows the provider gross, commission and net', () => {
    const provider = providerPriceBreakdown(calculateFee(1000, rules));
    expect(provider.gross).toBe(1000);
    expect(provider.platformFee).toBe(100);
    expect(provider.net).toBe(900);
    expect(provider.rate).toBeCloseTo(0.1, 4);
  });

  it('never charges a fee larger than the job itself', () => {
    const punitive: PlatformFeeRules = { ...rules, minimum_fee: 500, tiers: [] };
    const breakdown = calculateFee(100, punitive);
    expect(breakdown.platformFee).toBe(100);
    expect(breakdown.providerPayout).toBe(0);
  });
});
