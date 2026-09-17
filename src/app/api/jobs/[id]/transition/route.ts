import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import {
  canTransition,
  type Actor,
  type JobStatus,
  JOB_STATUSES,
} from '@/domains/jobs/state-machine';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { logOperation, newRequestId } from '@/lib/logger';

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  to: z.enum(JOB_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

/** Timestamp columns that mark progress through the job. */
const ASSIGNMENT_TIMESTAMPS: Partial<Record<JobStatus, string>> = {
  EN_ROUTE: 'en_route_at',
  ARRIVED: 'arrived_at',
  IN_PROGRESS: 'started_at',
  AWAITING_CUSTOMER_CONFIRMATION: 'completed_at',
};

/**
 * Drive a job through its lifecycle (spec §20).
 *
 * Validated in three independent layers, deliberately:
 *   1. here, against the TypeScript state machine, for a clean error;
 *   2. by RLS, which decides whether this user may touch this row at all;
 *   3. by the database trigger, which re-checks the transition and the actor
 *      role and writes the audit row.
 *
 * Layer 3 is the one that actually guarantees correctness — 1 and 2 could be
 * bypassed by a bug and the invariant would still hold.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const user = await requireUser();
    const { id } = paramsSchema.parse(await context.params);
    const body = await parseJson(request, bodySchema);

    const actor: Actor = user.role;

    const current = await withUser(user.id, (db) =>
      db.one<{ status: JobStatus; customer_id: string; provider_id: string | null }>(
        `select j.status::text as status, j.customer_id, a.provider_id
           from jobs j
           left join job_assignments a on a.job_id = j.id
          where j.id = $1`,
        [id],
      ),
    );

    if (!current) throw new ApiError('NOT_FOUND', 'העבודה לא נמצאה', 404);

    if (!canTransition(current.status, body.to)) {
      throw new ApiError(
        'INVALID_TRANSITION',
        `לא ניתן לעבור מ-${current.status} ל-${body.to}`,
        409,
        { from: current.status, to: body.to },
      );
    }
    if (!canTransition(current.status, body.to, actor)) {
      throw new ApiError('FORBIDDEN', 'אין לך הרשאה לבצע את המעבר הזה', 403, {
        from: current.status,
        to: body.to,
        actor,
      });
    }

    await withUser(
      user.id,
      async (db) => {
        await db.query(`update jobs set status = $2::job_status where id = $1`, [id, body.to]);

        const column = ASSIGNMENT_TIMESTAMPS[body.to];
        if (column) {
          await db.query(
            `update job_assignments set ${column} = coalesce(${column}, now()) where job_id = $1`,
            [id],
          );
        }

        if (body.to === 'CANCELLED_BY_CUSTOMER' || body.to === 'CANCELLED_BY_PROVIDER') {
          await db.query(
            `update jobs set cancellation_reason = $2, cancelled_by = $3 where id = $1`,
            [id, body.reason ?? null, user.id],
          );
        }
      },
      { actorRole: actor, transitionReason: body.reason ?? `${current.status} -> ${body.to}` },
    );

    // ── Side effects that belong to the system, not the user ──────────────
    if (body.to === 'CANCELLED_BY_PROVIDER') {
      // Free the provider and put the job back into matching (spec §44).
      await withSystem(async (db) => {
        if (current.provider_id) {
          await db.query(
            `update provider_profiles set state = 'ONLINE', state_changed_at = now()
              where id = $1 and state = 'BUSY'`,
            [current.provider_id],
          );
          await db.query(
            `update provider_profiles set cancelled_jobs = cancelled_jobs + 1 where id = $1`,
            [current.provider_id],
          );
        }
        await db.query('delete from job_assignments where job_id = $1', [id]);
      });

      await withSystem(
        async (db) => {
          await db.query(`update jobs set status = 'SEARCHING' where id = $1`, [id]);
        },
        { actorRole: 'system', transitionReason: 'Re-dispatch after provider cancellation' },
      );

      try {
        await runDispatchWave(id, { waveOverride: 1 });
      } catch (error) {
        logOperation({
          requestId, jobId: id, operation: 'jobs.transition.redispatch', result: 'error',
          meta: { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
        });
      }
    }

    if (body.to === 'COMPLETED' || body.to === 'CANCELLED_BY_CUSTOMER') {
      // The provider becomes available again once the work is settled.
      await withSystem(async (db) => {
        if (current.provider_id) {
          await db.query(
            `update provider_profiles set state = 'ONLINE', state_changed_at = now()
              where id = $1 and state = 'BUSY'`,
            [current.provider_id],
          );
          if (body.to === 'COMPLETED') {
            await db.query(
              `update provider_profiles set completed_jobs = completed_jobs + 1 where id = $1`,
              [current.provider_id],
            );
          }
        }
        // Stop advertising a destination once the trip is over.
        if (current.provider_id) {
          await db.query(
            `update provider_locations set destination = null, destination_job_id = null
              where provider_id = $1 and destination_job_id = $2`,
            [current.provider_id, id],
          );
        }
      });
    }

    if (body.to === 'EN_ROUTE' && current.provider_id) {
      // The provider is now demonstrably going to this customer: record it as
      // their destination so route opportunity can use it for other jobs.
      await withSystem(async (db) => {
        await db.query(
          `update provider_locations pl
              set destination = j.location, destination_job_id = j.id
             from jobs j
            where j.id = $2 and pl.provider_id = $1`,
          [current.provider_id, id],
        );
      });
    }

    await withSystem(async (db) => {
      const recipient =
        actor === 'provider' ? current.customer_id : current.provider_id;
      if (!recipient) return;
      await db.query(
        `insert into notifications (user_id, job_id, kind, title, body)
         values ($1,$2,$3,$4,$5)`,
        [recipient, id, `job.${body.to.toLowerCase()}`, statusTitle(body.to), body.reason ?? null],
      );
    });

    logOperation({
      requestId, userId: user.id, jobId: id,
      providerId: current.provider_id,
      operation: 'jobs.transition', result: 'ok',
      durationMs: Date.now() - startedAt,
      meta: { from: current.status, to: body.to, actor },
    });

    return ok({ id, status: body.to });
  } catch (error) {
    return handleError(error, 'jobs.transition', requestId, startedAt);
  }
}

function statusTitle(status: JobStatus): string {
  const titles: Partial<Record<JobStatus, string>> = {
    CONFIRMED: 'הלקוח אישר את ההזמנה',
    EN_ROUTE: 'המקצוען בדרך אליך',
    ARRIVED: 'המקצוען הגיע',
    IN_PROGRESS: 'העבודה החלה',
    AWAITING_CUSTOMER_CONFIRMATION: 'העבודה הושלמה — נדרש אישורך',
    COMPLETED: 'העבודה הושלמה',
    PAID: 'התשלום בוצע',
    CANCELLED_BY_CUSTOMER: 'הלקוח ביטל את ההזמנה',
    CANCELLED_BY_PROVIDER: 'המקצוען ביטל — אנחנו מחפשים מקצוען אחר',
    CANCELLED_BY_SYSTEM: 'ההזמנה בוטלה',
    DISPUTED: 'נפתחה מחלוקת',
  };
  return titles[status] ?? 'עדכון בעבודה';
}
