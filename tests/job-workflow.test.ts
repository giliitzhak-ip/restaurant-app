import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STATUSES,
  acceptsOffers,
  cancellationFee,
  canActorTransition,
  canTransition,
  isActive,
  isTerminal,
  JOB_FLOW,
  TIMELINE_ORDER,
} from '@/lib/services/jobs/workflow';
import { SETTINGS_DEFAULTS } from '@/lib/services/settings/schema';
import type { JobStatus } from '@/types/database';

describe('job state machine', () => {
  it('walks the happy path end to end', () => {
    const happyPath: JobStatus[] = [
      'requested',
      'searching',
      'offers_received',
      'provider_selected',
      'provider_on_the_way',
      'arrived',
      'in_progress',
      'completed',
    ];

    for (let i = 0; i < happyPath.length - 1; i += 1) {
      expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('refuses to skip straight from a new request to completion', () => {
    expect(canTransition('requested', 'completed')).toBe(false);
    expect(canTransition('searching', 'in_progress')).toBe(false);
    expect(canTransition('offers_received', 'arrived')).toBe(false);
  });

  it('treats cancelled as final', () => {
    expect(JOB_FLOW.cancelled).toEqual([]);
    expect(isTerminal('cancelled')).toBe(true);
    expect(canTransition('cancelled', 'in_progress')).toBe(false);
  });

  it('allows a dispute only after work has started', () => {
    expect(canTransition('in_progress', 'disputed')).toBe(true);
    expect(canTransition('completed', 'disputed')).toBe(true);
    expect(canTransition('searching', 'disputed')).toBe(false);
  });
});

describe('who may drive a transition', () => {
  it('lets the provider report progress but not select themselves', () => {
    expect(canActorTransition('provider_selected', 'provider_on_the_way', 'provider')).toBe(true);
    expect(canActorTransition('arrived', 'in_progress', 'provider')).toBe(true);
    expect(canActorTransition('offers_received', 'provider_selected', 'provider')).toBe(false);
  });

  it('lets the customer choose a provider but not mark the job done', () => {
    expect(canActorTransition('offers_received', 'provider_selected', 'customer')).toBe(true);
    expect(canActorTransition('in_progress', 'completed', 'customer')).toBe(false);
  });

  it('lets either party cancel a live job', () => {
    expect(canActorTransition('provider_selected', 'cancelled', 'customer')).toBe(true);
    expect(canActorTransition('provider_selected', 'cancelled', 'provider')).toBe(true);
  });

  it('gives an admin every legal transition but no illegal one', () => {
    expect(canActorTransition('in_progress', 'completed', 'admin')).toBe(true);
    expect(canActorTransition('cancelled', 'completed', 'admin')).toBe(false);
  });
});

describe('status helpers', () => {
  it('counts only live statuses as active', () => {
    for (const status of ACTIVE_STATUSES) expect(isActive(status)).toBe(true);
    expect(isActive('completed')).toBe(false);
    expect(isActive('cancelled')).toBe(false);
  });

  it('accepts offers only while the job is still open', () => {
    expect(acceptsOffers('searching')).toBe(true);
    expect(acceptsOffers('offers_received')).toBe(true);
    expect(acceptsOffers('provider_selected')).toBe(false);
  });

  it('orders the timeline from request to completion', () => {
    expect(TIMELINE_ORDER[0]).toBe('requested');
    expect(TIMELINE_ORDER.at(-1)).toBe('completed');
  });
});

describe('cancellation fee', () => {
  const policy = SETTINGS_DEFAULTS.cancellation;

  it('is free before a provider is committed', () => {
    expect(cancellationFee('searching', 1000, 120, policy)).toBe(0);
    expect(cancellationFee('offers_received', 1000, 120, policy)).toBe(0);
  });

  it('is free inside the grace window', () => {
    expect(cancellationFee('provider_selected', 1000, 5, policy)).toBe(0);
  });

  it('charges the configured percentage after the grace window', () => {
    expect(cancellationFee('provider_selected', 1000, 30, policy)).toBe(50);
    expect(cancellationFee('arrived', 400, 60, policy)).toBe(20);
  });

  it('is zero when no price was agreed', () => {
    expect(cancellationFee('provider_selected', null, 60, policy)).toBe(0);
  });

  it('does not apply once the work is underway', () => {
    expect(cancellationFee('in_progress', 1000, 120, policy)).toBe(0);
  });
});
