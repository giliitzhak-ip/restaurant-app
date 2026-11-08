import { haversineKm, isValidLatLng, type LatLng } from '@/lib/utils/geo';
import { SETTINGS_DEFAULTS } from '@/lib/services/settings/defaults';
import type { VerificationSettings } from '@/lib/services/settings/schema';

/**
 * Did the job actually happen?
 *
 * With the commission charged up front, this is the question the platform has
 * to be able to answer — not to release money (it never holds any) but to know
 * when a charge should come back, and to give a dispute something to stand on.
 *
 * Three independent signals, none of which the provider can supply alone:
 *   1. a GPS check-in at the address, compared against the job's coordinates;
 *   2. a photo taken at completion;
 *   3. the customer saying it happened.
 *
 * All pure functions: the API route gathers the inputs, this decides.
 */

export type ArrivalResult =
  | { ok: true; distanceM: number; toleranceM: number; verified: boolean }
  | { ok: false; error: 'invalid_location' | 'job_has_no_location' };

/**
 * Compares a check-in against the job's own coordinates.
 *
 * A check-in outside the tolerance is still recorded — it is evidence either
 * way, and a provider legitimately parked round the corner looks very different
 * from one checking in from another city.
 */
export function checkArrival(
  jobLocation: Partial<LatLng> | null,
  checkin: Partial<LatLng> | null,
  verification: VerificationSettings = SETTINGS_DEFAULTS.verification,
): ArrivalResult {
  if (!isValidLatLng(jobLocation)) return { ok: false, error: 'job_has_no_location' };
  if (!isValidLatLng(checkin)) return { ok: false, error: 'invalid_location' };

  const distanceM = Math.round(haversineKm(jobLocation, checkin) * 1000);
  return {
    ok: true,
    distanceM,
    toleranceM: verification.arrival_radius_m,
    verified: distanceM <= verification.arrival_radius_m,
  };
}

/** Relative gap between the agreed price and what the customer reports paying. */
export function priceGap(agreed: number | null, reported: number | null): number | null {
  if (!agreed || !reported || agreed <= 0) return null;
  return Math.abs(reported - agreed) / agreed;
}

export function isPriceGapFlagged(
  agreed: number | null,
  reported: number | null,
  verification: VerificationSettings = SETTINGS_DEFAULTS.verification,
): boolean {
  const gap = priceGap(agreed, reported);
  return gap !== null && gap > verification.flag_price_gap_percent;
}

export interface JobEvidence {
  arrivalVerifiedAt: string | null;
  completionPhotos: number;
  customerConfirmedAt: string | null;
  completedAt: string | null;
}

export type VerificationLevel =
  /** Nothing but the provider's own word. */
  | 'unverified'
  /** Some independent signal, but not the customer's confirmation. */
  | 'partial'
  /** Everything the settings ask for. */
  | 'verified';

export interface VerificationState {
  level: VerificationLevel;
  /** The signals the settings require that are still missing. */
  missing: Array<'arrival' | 'photo' | 'confirmation'>;
  /** True when the evidence actively suggests the job never took place. */
  suspectedNoShow: boolean;
}

/**
 * What the evidence adds up to.
 *
 * `suspectedNoShow` is deliberately narrow: a job marked completed, with no
 * verified arrival and no customer confirmation, after the auto-confirm window
 * has passed. That combination is what an invented booking looks like, and it
 * is the one case that justifies reversing a charge on the platform's own
 * initiative.
 */
export function verificationState(
  evidence: JobEvidence,
  verification: VerificationSettings = SETTINGS_DEFAULTS.verification,
  now: Date = new Date(),
): VerificationState {
  const missing: VerificationState['missing'] = [];

  if (verification.require_arrival_checkin && !evidence.arrivalVerifiedAt) missing.push('arrival');
  if (verification.require_completion_photo && evidence.completionPhotos < 1) missing.push('photo');
  if (verification.require_customer_confirmation && !evidence.customerConfirmedAt) {
    missing.push('confirmation');
  }

  const anySignal =
    Boolean(evidence.arrivalVerifiedAt) ||
    evidence.completionPhotos > 0 ||
    Boolean(evidence.customerConfirmedAt);

  const level: VerificationLevel =
    missing.length === 0 ? 'verified' : anySignal ? 'partial' : 'unverified';

  const suspectedNoShow =
    Boolean(evidence.completedAt) &&
    !evidence.arrivalVerifiedAt &&
    !evidence.customerConfirmedAt &&
    evidence.completionPhotos === 0 &&
    autoConfirmDue(evidence.completedAt, verification, now);

  return { level, missing, suspectedNoShow };
}

/**
 * Whether a completed job has waited long enough to be treated as confirmed.
 *
 * Silence is not evidence of a problem: most customers never come back to press
 * a button. After the window, the job counts as confirmed so that reputation
 * and reporting are not held hostage to that silence — but the ledger records
 * it as an auto-confirmation, never as the customer's own.
 */
export function autoConfirmDue(
  completedAt: string | Date | null,
  verification: VerificationSettings = SETTINGS_DEFAULTS.verification,
  now: Date = new Date(),
): boolean {
  if (!completedAt) return false;
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) return false;
  const hours = (now.getTime() - completed.getTime()) / 3_600_000;
  return hours >= verification.auto_confirm_after_hours;
}
