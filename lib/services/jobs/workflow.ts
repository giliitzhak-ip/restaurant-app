import type { ActorType, JobStatus } from '@/types/database';

/**
 * The job lifecycle, as a state machine.
 *
 * REQUESTED → SEARCHING → OFFERS_RECEIVED → PROVIDER_SELECTED →
 * PROVIDER_ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED
 * with CANCELLED and DISPUTED reachable from most live states.
 *
 * Kept pure so it can be unit-tested and reused by both the API and the UI.
 */
export const JOB_FLOW: Record<JobStatus, JobStatus[]> = {
  requested: ['searching', 'offers_received', 'cancelled'],
  searching: ['offers_received', 'cancelled'],
  offers_received: ['provider_selected', 'searching', 'cancelled'],
  provider_selected: ['provider_on_the_way', 'in_progress', 'cancelled'],
  provider_on_the_way: ['arrived', 'cancelled'],
  arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'disputed', 'cancelled'],
  completed: ['disputed'],
  cancelled: [],
  disputed: ['completed', 'cancelled'],
};

/** Who is allowed to move a job into a given status. */
const TRANSITION_ACTORS: Record<JobStatus, ActorType[]> = {
  requested: ['customer', 'system'],
  searching: ['system', 'admin'],
  offers_received: ['system', 'provider', 'admin'],
  provider_selected: ['customer', 'admin'],
  provider_on_the_way: ['provider', 'admin'],
  arrived: ['provider', 'admin'],
  in_progress: ['provider', 'admin'],
  completed: ['provider', 'admin'],
  cancelled: ['customer', 'provider', 'admin', 'system'],
  disputed: ['customer', 'provider', 'admin'],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_FLOW[from]?.includes(to) ?? false;
}

export function canActorTransition(from: JobStatus, to: JobStatus, actor: ActorType): boolean {
  if (actor === 'admin') return canTransition(from, to);
  return canTransition(from, to) && (TRANSITION_ACTORS[to]?.includes(actor) ?? false);
}

/** Statuses where the job is still live and shows in "active jobs". */
export const ACTIVE_STATUSES: JobStatus[] = [
  'requested',
  'searching',
  'offers_received',
  'provider_selected',
  'provider_on_the_way',
  'arrived',
  'in_progress',
];

/** Statuses where a provider may still submit an offer. */
export const OPEN_FOR_OFFERS: JobStatus[] = ['requested', 'searching', 'offers_received'];

export function isActive(status: JobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminal(status: JobStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export function acceptsOffers(status: JobStatus): boolean {
  return OPEN_FOR_OFFERS.includes(status);
}

/** Cancelling is free before a provider is committed, or inside the grace window. */
export function cancellationFee(
  status: JobStatus,
  agreedPrice: number | null,
  minutesSinceSelection: number,
  settings: { free_window_minutes: number; customer_fee_percentage: number },
): number {
  if (!agreedPrice) return 0;
  if (!['provider_selected', 'provider_on_the_way', 'arrived'].includes(status)) return 0;
  if (minutesSinceSelection <= settings.free_window_minutes) return 0;
  return Math.round(agreedPrice * settings.customer_fee_percentage * 100) / 100;
}

/** Display order for a job timeline, including statuses not yet reached. */
export const TIMELINE_ORDER: JobStatus[] = [
  'requested',
  'searching',
  'offers_received',
  'provider_selected',
  'provider_on_the_way',
  'arrived',
  'in_progress',
  'completed',
];
