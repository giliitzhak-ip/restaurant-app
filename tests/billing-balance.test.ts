import { describe, expect, it } from 'vitest';
import { balanceStatus, refundDecision, suggestedTopup } from '@/lib/services/billing/balance';
import { SETTINGS_DEFAULTS } from '@/lib/services/settings/defaults';

const billing = SETTINGS_DEFAULTS.billing;

describe('balanceStatus', () => {
  it('blocks a provider whose balance cannot cover the commission on hand', () => {
    const status = balanceStatus(40, billing, 60);

    expect(status.canAcceptWork).toBe(false);
    expect(status.state).toBe('blocked');
    expect(status.shortfall).toBe(20);
    expect(status.pendingCharge).toBe(60);
  });

  it('allows a balance that exactly covers the commission', () => {
    const status = balanceStatus(60, billing, 60);

    expect(status.canAcceptWork).toBe(true);
    expect(status.shortfall).toBe(0);
  });

  it('warns while still inside the low-balance band', () => {
    // 150 is the shipped threshold, so anything at or under it warns.
    expect(balanceStatus(150, billing).state).toBe('low');
    expect(balanceStatus(150.01, billing).state).toBe('ok');
  });

  it('respects a non-zero floor, so the floor is never spent', () => {
    const withFloor = { ...billing, minimum_balance: 100 };

    expect(balanceStatus(150, withFloor, 60).canAcceptWork).toBe(false);
    expect(balanceStatus(150, withFloor, 60).shortfall).toBe(10);
    expect(balanceStatus(160, withFloor, 60).canAcceptWork).toBe(true);
  });

  it('rounds to the agora rather than trusting float arithmetic', () => {
    expect(balanceStatus(0.1 + 0.2, billing).balance).toBe(0.3);
  });
});

describe('refundDecision', () => {
  const chargedAt = new Date('2026-01-01T10:00:00Z');
  const soon = new Date('2026-01-01T12:00:00Z');
  const late = new Date('2026-01-05T12:00:00Z');

  it('returns the commission when the customer cancelled', () => {
    const decision = refundDecision({ cancelledBy: 'customer', chargedAt, now: soon, billing });

    expect(decision.refund).toBe(true);
    expect(decision.code).toBe('customer_cancelled');
  });

  it('keeps the commission when the provider cancelled', () => {
    // The asymmetry is the point: charging at acceptance only works if walking
    // away from accepted work costs the provider something.
    const decision = refundDecision({ cancelledBy: 'provider', chargedAt, now: soon, billing });

    expect(decision.refund).toBe(false);
    expect(decision.code).toBe('provider_cancelled');
  });

  it('honours a policy that does refund provider cancellations', () => {
    const decision = refundDecision({
      cancelledBy: 'provider',
      chargedAt,
      now: soon,
      billing: { ...billing, refund_on_provider_cancellation: true },
    });

    expect(decision.refund).toBe(true);
  });

  it('closes the automatic window after the configured hours', () => {
    const decision = refundDecision({ cancelledBy: 'customer', chargedAt, now: late, billing });

    expect(decision.refund).toBe(false);
    expect(decision.code).toBe('window_expired');
  });

  it('refunds a job proven not to have happened regardless of the window', () => {
    const decision = refundDecision({
      cancelledBy: 'customer',
      chargedAt,
      now: late,
      neverHappened: true,
      billing,
    });

    expect(decision.refund).toBe(true);
    expect(decision.code).toBe('never_happened');
  });

  it('lets an admin ruling override the window too', () => {
    const decision = refundDecision({ cancelledBy: 'admin', chargedAt, now: late, billing });

    expect(decision.refund).toBe(true);
    expect(decision.code).toBe('admin');
  });

  it('never refunds twice', () => {
    const decision = refundDecision({
      cancelledBy: 'customer',
      chargedAt,
      now: soon,
      alreadyRefunded: true,
      billing,
    });

    expect(decision.refund).toBe(false);
    expect(decision.code).toBe('already_refunded');
  });
});

describe('suggestedTopup', () => {
  it('picks the smallest preset that clears the shortfall', () => {
    expect(suggestedTopup(60, billing)).toBe(100);
    expect(suggestedTopup(100, billing)).toBe(100);
    expect(suggestedTopup(101, billing)).toBe(250);
  });

  it('falls back to the largest preset when nothing covers it', () => {
    expect(suggestedTopup(5000, billing)).toBe(1000);
  });
});
