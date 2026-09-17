import { describe, expect, it } from 'vitest';
import {
  agorotToShekels,
  calculateFee,
  DEFAULT_FEE_RULE,
  selectFeeRule,
  shekelsToAgorot,
  type FeeRule,
} from '@/domains/payments/fees';

describe('commission model (spec §28)', () => {
  it('charges 15% up to ₪1,000', () => {
    const result = calculateFee(shekelsToAgorot(290));
    expect(result.platformFee).toBe(shekelsToAgorot(43.5));
    expect(result.providerAmount).toBe(shekelsToAgorot(246.5));
    expect(result.effectivePercentage).toBe(15);
  });

  it('charges 10% above ₪1,000', () => {
    const result = calculateFee(shekelsToAgorot(1500));
    expect(result.platformFee).toBe(shekelsToAgorot(150));
    expect(result.effectivePercentage).toBe(10);
  });

  it('treats exactly ₪1,000 as the 15% tier', () => {
    const result = calculateFee(shekelsToAgorot(1000));
    expect(result.effectivePercentage).toBe(15);
    expect(result.platformFee).toBe(shekelsToAgorot(150));
  });

  it('always splits the gross exactly, with no lost agorot', () => {
    for (const shekels of [0.01, 1, 33.33, 99.99, 290, 999.99, 1000.01, 5000, 12345.67]) {
      const gross = shekelsToAgorot(shekels);
      const { platformFee, providerAmount } = calculateFee(gross);
      expect(platformFee + providerAmount).toBe(gross);
      expect(Number.isInteger(platformFee)).toBe(true);
      expect(Number.isInteger(providerAmount)).toBe(true);
    }
  });

  it('handles a zero-value job without dividing by zero', () => {
    const result = calculateFee(0);
    expect(result.platformFee).toBe(0);
    expect(result.providerAmount).toBe(0);
    expect(result.effectivePercentage).toBe(0);
  });

  it('rejects non-integer or negative amounts rather than rounding silently', () => {
    expect(() => calculateFee(290.5)).toThrow(/agorot/);
    expect(() => calculateFee(-100)).toThrow(/non-negative/);
  });

  it('supports a flat percentage rule', () => {
    const rule: FeeRule = {
      name: '12% flat', feeType: 'percentage', categoryId: null, priority: 10,
      config: { percentage: 12 },
    };
    expect(calculateFee(shekelsToAgorot(500), rule).platformFee).toBe(shekelsToAgorot(60));
  });

  it('supports a fixed fee, capped at the gross', () => {
    const rule: FeeRule = {
      name: '₪20 fixed', feeType: 'fixed', categoryId: null, priority: 10,
      config: { amount: shekelsToAgorot(20) },
    };
    expect(calculateFee(shekelsToAgorot(500), rule).platformFee).toBe(shekelsToAgorot(20));
    // Never take more than the job was worth.
    expect(calculateFee(shekelsToAgorot(5), rule).platformFee).toBe(shekelsToAgorot(5));
  });

  it('honours min and max bounds on a percentage rule', () => {
    const rule: FeeRule = {
      name: 'bounded', feeType: 'percentage', categoryId: null, priority: 10,
      config: { percentage: 15, minFee: shekelsToAgorot(10), maxFee: shekelsToAgorot(50) },
    };
    expect(calculateFee(shekelsToAgorot(20), rule).platformFee).toBe(shekelsToAgorot(10));
    expect(calculateFee(shekelsToAgorot(5000), rule).platformFee).toBe(shekelsToAgorot(50));
  });

  it('prefers a category override over the platform default', () => {
    const rules: FeeRule[] = [
      DEFAULT_FEE_RULE,
      {
        name: 'cleaning 8%', feeType: 'percentage', categoryId: 'cat-cleaning',
        priority: 10, config: { percentage: 8 },
      },
    ];
    expect(selectFeeRule(rules, 'cat-cleaning').name).toBe('cleaning 8%');
    expect(selectFeeRule(rules, 'cat-plumbing').name).toBe(DEFAULT_FEE_RULE.name);
    expect(selectFeeRule([], null).name).toBe(DEFAULT_FEE_RULE.name);
  });

  it('converts between shekels and agorot without float drift', () => {
    expect(shekelsToAgorot(0.1 + 0.2)).toBe(30);
    expect(agorotToShekels(4350)).toBe(43.5);
  });
});
