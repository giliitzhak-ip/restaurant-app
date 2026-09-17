/**
 * Job state machine (spec §20).
 *
 * This is the single place the application reasons about job status. There is
 * no ad-hoc string comparison of statuses anywhere else.
 *
 * The AUTHORITATIVE copy of these transitions is the `job_transitions` table
 * (spec §22: the database is the source of truth). This module mirrors it so
 * the UI can disable impossible actions without a round trip;
 * tests/integration/state-machine.test.ts asserts the two are identical, so
 * they cannot silently drift.
 */

export const JOB_STATUSES = [
  'REQUESTED',
  'SEARCHING',
  'OFFERS_AVAILABLE',
  'PROVIDER_SELECTED',
  'CONFIRMED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER_CONFIRMATION',
  'COMPLETED',
  'PAID',
  'REVIEWED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_PROVIDER',
  'CANCELLED_BY_SYSTEM',
  'DISPUTED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type Actor = 'customer' | 'provider' | 'admin' | 'system';

export interface TransitionRule {
  readonly to: JobStatus;
  readonly actors: readonly Actor[];
}

/** Mirror of public.job_transitions. */
export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly TransitionRule[]>> = {
  REQUESTED: [
    { to: 'SEARCHING', actors: ['admin', 'system'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['customer', 'admin'] },
    { to: 'CANCELLED_BY_SYSTEM', actors: ['admin', 'system'] },
  ],
  SEARCHING: [
    { to: 'OFFERS_AVAILABLE', actors: ['admin', 'system'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['customer', 'admin'] },
    { to: 'CANCELLED_BY_SYSTEM', actors: ['admin', 'system'] },
  ],
  OFFERS_AVAILABLE: [
    { to: 'PROVIDER_SELECTED', actors: ['provider', 'admin'] },
    { to: 'SEARCHING', actors: ['admin', 'system'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['customer', 'admin'] },
    { to: 'CANCELLED_BY_SYSTEM', actors: ['admin', 'system'] },
  ],
  PROVIDER_SELECTED: [
    { to: 'CONFIRMED', actors: ['customer', 'admin'] },
    { to: 'SEARCHING', actors: ['admin', 'system'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['customer', 'admin'] },
    { to: 'CANCELLED_BY_PROVIDER', actors: ['provider', 'admin'] },
    { to: 'CANCELLED_BY_SYSTEM', actors: ['admin', 'system'] },
  ],
  CONFIRMED: [
    { to: 'EN_ROUTE', actors: ['provider', 'admin'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['customer', 'admin'] },
    { to: 'CANCELLED_BY_PROVIDER', actors: ['provider', 'admin'] },
    { to: 'CANCELLED_BY_SYSTEM', actors: ['admin', 'system'] },
  ],
  EN_ROUTE: [
    { to: 'ARRIVED', actors: ['provider', 'admin'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['customer', 'admin'] },
    { to: 'CANCELLED_BY_PROVIDER', actors: ['provider', 'admin'] },
    { to: 'CANCELLED_BY_SYSTEM', actors: ['admin', 'system'] },
  ],
  ARRIVED: [
    { to: 'IN_PROGRESS', actors: ['provider', 'admin'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['customer', 'admin'] },
    { to: 'CANCELLED_BY_PROVIDER', actors: ['provider', 'admin'] },
    { to: 'DISPUTED', actors: ['customer', 'provider', 'admin'] },
  ],
  IN_PROGRESS: [
    { to: 'AWAITING_CUSTOMER_CONFIRMATION', actors: ['provider', 'admin'] },
    { to: 'DISPUTED', actors: ['customer', 'provider', 'admin'] },
    { to: 'CANCELLED_BY_PROVIDER', actors: ['provider', 'admin'] },
  ],
  AWAITING_CUSTOMER_CONFIRMATION: [
    { to: 'COMPLETED', actors: ['customer', 'admin', 'system'] },
    { to: 'DISPUTED', actors: ['customer', 'admin'] },
  ],
  COMPLETED: [
    { to: 'PAID', actors: ['admin', 'system'] },
    { to: 'DISPUTED', actors: ['customer', 'provider', 'admin'] },
  ],
  PAID: [
    { to: 'REVIEWED', actors: ['customer', 'provider', 'admin', 'system'] },
    { to: 'DISPUTED', actors: ['customer', 'provider', 'admin'] },
  ],
  REVIEWED: [{ to: 'DISPUTED', actors: ['customer', 'provider', 'admin'] }],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_PROVIDER: [{ to: 'SEARCHING', actors: ['admin', 'system'] }],
  CANCELLED_BY_SYSTEM: [],
  DISPUTED: [
    { to: 'COMPLETED', actors: ['admin'] },
    { to: 'PAID', actors: ['admin'] },
    { to: 'CANCELLED_BY_SYSTEM', actors: ['admin'] },
  ],
};

/**
 * Is this transition legal, and may this actor perform it?
 *
 * Omitting `actor` asks only whether the transition exists at all.
 */
export function canTransition(from: JobStatus, to: JobStatus, actor?: Actor): boolean {
  const rule = JOB_TRANSITIONS[from]?.find((r) => r.to === to);
  if (!rule) return false;
  if (!actor) return true;
  return rule.actors.includes(actor);
}

/** Statuses reachable from `from`, optionally limited to one actor. */
export function allowedTransitions(from: JobStatus, actor?: Actor): readonly JobStatus[] {
  const rules = JOB_TRANSITIONS[from] ?? [];
  return rules.filter((r) => !actor || r.actors.includes(actor)).map((r) => r.to);
}

const TERMINAL: readonly JobStatus[] = [
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_SYSTEM',
  'REVIEWED',
];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.includes(status);
}

export function isCancelled(status: JobStatus): boolean {
  return status.startsWith('CANCELLED_BY_');
}

/** Statuses in which a job is actively being worked. */
export function isActive(status: JobStatus): boolean {
  return [
    'REQUESTED',
    'SEARCHING',
    'OFFERS_AVAILABLE',
    'PROVIDER_SELECTED',
    'CONFIRMED',
    'EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS',
    'AWAITING_CUSTOMER_CONFIRMATION',
  ].includes(status);
}

/** Is the provider currently travelling to or working at the customer? */
export function isProviderEngaged(status: JobStatus): boolean {
  return ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(status);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: JobStatus,
    readonly to: JobStatus,
    readonly actor?: Actor,
  ) {
    super(
      actor
        ? `Actor "${actor}" may not move a job from ${from} to ${to}`
        : `Cannot move a job from ${from} to ${to}`,
    );
    this.name = 'InvalidTransitionError';
  }
}

/** Throwing guard for server-side call sites. */
export function assertTransition(from: JobStatus, to: JobStatus, actor?: Actor): void {
  if (!canTransition(from, to, actor)) {
    throw new InvalidTransitionError(from, to, actor);
  }
}
