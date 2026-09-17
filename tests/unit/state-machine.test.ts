import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isActive,
  isCancelled,
  isProviderEngaged,
  isTerminal,
  JOB_STATUSES,
  JOB_TRANSITIONS,
} from '@/domains/jobs/state-machine';

describe('job state machine', () => {
  it('permits the golden path end to end', () => {
    const path = [
      ['REQUESTED', 'SEARCHING'],
      ['SEARCHING', 'OFFERS_AVAILABLE'],
      ['OFFERS_AVAILABLE', 'PROVIDER_SELECTED'],
      ['PROVIDER_SELECTED', 'CONFIRMED'],
      ['CONFIRMED', 'EN_ROUTE'],
      ['EN_ROUTE', 'ARRIVED'],
      ['ARRIVED', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION'],
      ['AWAITING_CUSTOMER_CONFIRMATION', 'COMPLETED'],
      ['COMPLETED', 'PAID'],
      ['PAID', 'REVIEWED'],
    ] as const;

    for (const [from, to] of path) {
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  it('rejects skipping ahead in the lifecycle', () => {
    expect(canTransition('REQUESTED', 'COMPLETED')).toBe(false);
    expect(canTransition('SEARCHING', 'PAID')).toBe(false);
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(false);
    expect(canTransition('REQUESTED', 'EN_ROUTE')).toBe(false);
  });

  it('rejects going backwards', () => {
    expect(canTransition('ARRIVED', 'EN_ROUTE')).toBe(false);
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('PAID', 'COMPLETED')).toBe(false);
  });

  it('never allows a transition out of a terminal state', () => {
    expect(allowedTransitions('CANCELLED_BY_CUSTOMER')).toEqual([]);
    expect(allowedTransitions('CANCELLED_BY_SYSTEM')).toEqual([]);
    expect(isTerminal('CANCELLED_BY_CUSTOMER')).toBe(true);
    expect(isTerminal('REVIEWED')).toBe(true);
  });

  it('only lets a provider mark work done, never the customer', () => {
    expect(canTransition('IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION', 'provider')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION', 'customer')).toBe(false);
  });

  it('only lets the customer confirm the match, never the provider', () => {
    expect(canTransition('PROVIDER_SELECTED', 'CONFIRMED', 'customer')).toBe(true);
    expect(canTransition('PROVIDER_SELECTED', 'CONFIRMED', 'provider')).toBe(false);
  });

  it('never lets a user mark a job PAID — only the payment service may', () => {
    expect(canTransition('COMPLETED', 'PAID', 'customer')).toBe(false);
    expect(canTransition('COMPLETED', 'PAID', 'provider')).toBe(false);
    expect(canTransition('COMPLETED', 'PAID', 'system')).toBe(true);
  });

  it('lets a provider cancellation return the job to matching (spec §44)', () => {
    expect(canTransition('CONFIRMED', 'CANCELLED_BY_PROVIDER', 'provider')).toBe(true);
    expect(canTransition('CANCELLED_BY_PROVIDER', 'SEARCHING', 'system')).toBe(true);
  });

  it('only an admin may resolve a dispute', () => {
    expect(canTransition('DISPUTED', 'COMPLETED', 'admin')).toBe(true);
    expect(canTransition('DISPUTED', 'COMPLETED', 'customer')).toBe(false);
    expect(canTransition('DISPUTED', 'PAID', 'provider')).toBe(false);
  });

  it('throws a descriptive error from the assert guard', () => {
    expect(() => assertTransition('REQUESTED', 'PAID')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION', 'customer'))
      .toThrow(/customer/);
    expect(() => assertTransition('REQUESTED', 'SEARCHING', 'system')).not.toThrow();
  });

  it('classifies statuses consistently', () => {
    expect(isActive('EN_ROUTE')).toBe(true);
    expect(isActive('COMPLETED')).toBe(false);
    expect(isCancelled('CANCELLED_BY_PROVIDER')).toBe(true);
    expect(isCancelled('DISPUTED')).toBe(false);
    expect(isProviderEngaged('EN_ROUTE')).toBe(true);
    expect(isProviderEngaged('SEARCHING')).toBe(false);
  });

  it('defines a transition list for every status, with only known targets', () => {
    for (const status of JOB_STATUSES) {
      const rules = JOB_TRANSITIONS[status];
      expect(rules, `missing rules for ${status}`).toBeDefined();
      for (const rule of rules) {
        expect(JOB_STATUSES).toContain(rule.to);
        expect(rule.actors.length).toBeGreaterThan(0);
      }
    }
  });

  it('has no duplicate transition targets for a status', () => {
    for (const status of JOB_STATUSES) {
      const targets = JOB_TRANSITIONS[status].map((r) => r.to);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });
});
