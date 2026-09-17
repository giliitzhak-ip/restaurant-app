import { ApiError } from '@/lib/api';
import { withSystem, withUser } from '@/lib/db';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { logOperation } from '@/lib/logger';

/** Marks an offer as rejected by the customer, and counts towards the cap. */
export const REJECTION_MARKER = 'customer_rejected_match';

/**
 * How many matches a customer may reject on one job before they have to start
 * over. Each rejection permanently excludes that provider from this job, so
 * without a cap the button walks the ranked list — a provider directory by
 * another name, which this product deliberately does not have.
 */
export const MAX_REJECTIONS = 3;

export interface RejectMatchResult {
  status: 'SEARCHING' | 'CANCELLED_BY_SYSTEM';
  rejectedProviderId: string;
  rejectionsUsed: number;
  rejectionsAllowed: number;
  dispatch: {
    wave: number;
    radiusKm: number;
    offersCreated: number;
    candidatesConsidered: number;
    exhausted: boolean;
  } | null;
}

/**
 * "Not this one — keep looking" (spec §10, §19).
 *
 * This exists because of the multi-offer model the product settled on: offers
 * go out to several providers at once and the FIRST to accept wins. The
 * customer therefore sees one match at a time rather than a shortlist, which
 * makes the match fast and the trust decision simple — but it left exactly
 * one way out of an unwanted match, which was to cancel the whole request and
 * retype it. Rejecting a person is not the same intention as abandoning the
 * job.
 *
 * So this frees the provider, excludes them from this job, returns the job to
 * SEARCHING and dispatches again from wave 1.
 *
 * It lives here rather than in the route handler so it can be tested against
 * a real database, which is where all of its interesting behaviour is.
 *
 * Fairness note: this does NOT increment the provider's `cancelled_jobs`.
 * They accepted in good faith and did nothing wrong, and a reliability score
 * that punishes them for someone else's change of mind is a broken score.
 */
export async function rejectMatch(options: {
  jobId: string;
  customerId: string;
  reason?: string;
  requestId?: string;
}): Promise<RejectMatchResult> {
  const { jobId, customerId, reason, requestId } = options;

  // Read AS THE CUSTOMER, so RLS decides whether this job is theirs to see at
  // all. A job belonging to someone else simply is not there.
  const current = await withUser(customerId, (db) =>
    db.one<{
      status: string;
      customer_id: string;
      provider_id: string | null;
      offer_id: string | null;
      rejections: number;
    }>(
      `select j.status::text as status, j.customer_id,
              a.provider_id, a.offer_id,
              (select count(*) from job_offers o
                where o.job_id = j.id and o.decline_reason = $2)::int as rejections
         from jobs j
         left join job_assignments a on a.job_id = j.id
        where j.id = $1`,
      [jobId, REJECTION_MARKER],
    ),
  );

  if (!current) throw new ApiError('NOT_FOUND', 'הקריאה לא נמצאה', 404);

  if (current.customer_id !== customerId) {
    throw new ApiError('FORBIDDEN', 'אין לך הרשאה לפעולה הזו', 403);
  }

  // Only a match still awaiting the customer's confirmation can be rejected.
  // Once confirmed, the provider may already be driving, and walking away
  // then is a cancellation with its own consequences.
  if (current.status !== 'PROVIDER_SELECTED') {
    throw new ApiError(
      'NOT_REJECTABLE',
      current.status === 'SEARCHING' || current.status === 'OFFERS_AVAILABLE'
        ? 'עדיין מחפשים — אין התאמה לדחות.'
        : 'אישרת את ההזמנה. כדי לבטל אותה יש להשתמש בביטול.',
      409,
      { status: current.status },
    );
  }

  if (!current.provider_id) {
    throw new ApiError('NOT_REJECTABLE', 'אין התאמה לדחות', 409);
  }

  if (current.rejections >= MAX_REJECTIONS) {
    throw new ApiError(
      'TOO_MANY_REJECTIONS',
      'דחית כבר שלוש התאמות בקריאה הזו. כדאי לבטל ולפתוח בקשה מדויקת יותר.',
      409,
      { rejections: current.rejections },
    );
  }

  const providerId = current.provider_id;

  /* ── Release, as the system ──────────────────────────────────────────────
     The offer keeps its accepted-then-cancelled history rather than being
     rewritten as DECLINED: the provider genuinely did accept, and
     matching_events.accepted stays true. decline_reason records whose
     decision undid it. The offer row also has to SURVIVE, because its
     existence is what keeps this provider out of the next candidate search —
     find_candidate_providers excludes anyone already holding an offer for
     the job. */
  await withSystem(async (db) => {
    await db.query(
      `update provider_profiles set state = 'ONLINE', state_changed_at = now()
        where id = $1 and state = 'BUSY'`,
      [providerId],
    );
    if (current.offer_id) {
      await db.query(
        `update job_offers
            set status = 'CANCELLED', responded_at = now(), decline_reason = $2
          where id = $1`,
        [current.offer_id, REJECTION_MARKER],
      );
    }
    // Stop advertising a destination for a trip that is not happening.
    await db.query(
      `update provider_locations set destination = null, destination_job_id = null
        where provider_id = $1 and destination_job_id = $2`,
      [providerId, jobId],
    );
    await db.query('delete from job_assignments where job_id = $1', [jobId]);
    // The quoted price belonged to the rejected offer.
    await db.query(
      'update jobs set quoted_price_ils = null, matched_at = null where id = $1',
      [jobId],
    );
  });

  await withSystem(
    async (db) => {
      await db.query(
        `update jobs set status = 'SEARCHING' where id = $1 and status = 'PROVIDER_SELECTED'`,
        [jobId],
      );
    },
    {
      actorRole: 'system',
      transitionReason: reason
        ? `Customer rejected the match: ${reason}`.slice(0, 500)
        : 'Customer rejected the match; searching again',
    },
  );

  // Wave 1 again, not the next wave: nobody failed to be found, so widening
  // the radius would be the wrong correction. The rejected provider is
  // already excluded by their surviving offer row.
  let dispatch: RejectMatchResult['dispatch'] = null;
  let exhausted = false;
  try {
    const outcome = await runDispatchWave(jobId, { waveOverride: 1 });
    exhausted = outcome.exhausted;
    dispatch = {
      wave: outcome.wave,
      radiusKm: outcome.radiusKm,
      offersCreated: outcome.offersCreated,
      candidatesConsidered: outcome.candidatesConsidered,
      exhausted: outcome.exhausted,
    };
  } catch (error) {
    // The job stays SEARCHING and the maintenance tick will retry it, so a
    // dispatch failure here does not lose the request.
    logOperation({
      requestId, jobId, operation: 'jobs.rejectMatch.dispatch', result: 'error',
      meta: { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
    });
  }

  return {
    status: exhausted ? 'CANCELLED_BY_SYSTEM' : 'SEARCHING',
    rejectedProviderId: providerId,
    rejectionsUsed: current.rejections + 1,
    rejectionsAllowed: MAX_REJECTIONS,
    dispatch,
  };
}
