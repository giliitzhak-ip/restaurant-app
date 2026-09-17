import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import { logOperation, newRequestId } from '@/lib/logger';

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
  punctuality: z.number().int().min(1).max(5).optional(),
  professionalism: z.number().int().min(1).max(5).optional(),
  valueScore: z.number().int().min(1).max(5).optional(),
});

/**
 * Two-sided reviews (spec §30).
 *
 * Eligibility is enforced by the RLS policy on `reviews`, which requires the
 * author to be a participant of a job that actually completed, in the
 * matching direction. This handler resolves the direction and lets the
 * database decide whether it is allowed.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();

  try {
    const user = await requireUser();
    const { id } = paramsSchema.parse(await context.params);
    const body = await parseJson(request, bodySchema);

    const job = await withUser(user.id, (db) =>
      db.one<{ status: string; customer_id: string; provider_id: string | null }>(
        `select j.status::text as status, j.customer_id, a.provider_id
           from jobs j
           left join job_assignments a on a.job_id = j.id
          where j.id = $1`,
        [id],
      ),
    );

    if (!job) throw new ApiError('NOT_FOUND', 'העבודה לא נמצאה', 404);
    if (!job.provider_id) throw new ApiError('NO_ASSIGNMENT', 'אין שיבוץ לעבודה', 409);

    const isCustomer = job.customer_id === user.id;
    const isProvider = job.provider_id === user.id;
    if (!isCustomer && !isProvider) {
      throw new ApiError('FORBIDDEN', 'רק משתתפי העבודה יכולים לדרג', 403);
    }

    const direction = isCustomer ? 'customer_to_provider' : 'provider_to_customer';
    const subjectId = isCustomer ? job.provider_id : job.customer_id;

    await withUser(user.id, async (db) => {
      await db.query(
        `insert into reviews
           (job_id, author_id, subject_id, direction, rating, comment,
            punctuality, professionalism, value_score)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id, user.id, subjectId, direction, body.rating, body.comment ?? null,
          isCustomer ? body.punctuality ?? null : null,
          isCustomer ? body.professionalism ?? null : null,
          isCustomer ? body.valueScore ?? null : null,
        ],
      );
    });

    // Recompute the subject's aggregate from the rows, never by incrementing
    // a counter, so the displayed rating always matches the reviews.
    await withSystem(async (db) => {
      const table = isCustomer ? 'provider_profiles' : 'customer_profiles';
      await db.query(
        `update ${table} p
            set rating_avg = agg.avg_rating, rating_count = agg.n
           from (
             select avg(rating)::numeric(3,2) as avg_rating, count(*)::int as n
               from reviews where subject_id = $1
           ) agg
          where p.id = $1`,
        [subjectId],
      );

      await db.query(
        `insert into notifications (user_id, job_id, kind, title, body)
         values ($1,$2,'review.received','קיבלת דירוג חדש',$3)`,
        [subjectId, id, `דירוג ${body.rating} מתוך 5`],
      );
    });

    // PAID -> REVIEWED once anyone has reviewed. Not an error if it is
    // already REVIEWED after the counterpart's review.
    if (job.status === 'PAID') {
      await withSystem(
        async (db) => {
          await db.query(
            `update jobs set status = 'REVIEWED' where id = $1 and status = 'PAID'`,
            [id],
          );
        },
        { actorRole: 'system', transitionReason: 'Review submitted' },
      );
    }

    logOperation({
      requestId, userId: user.id, jobId: id,
      operation: 'reviews.create', result: 'ok',
      meta: { direction, rating: body.rating },
    });

    return ok({ ok: true, direction }, { status: 201 });
  } catch (error) {
    return handleError(error, 'reviews.create', requestId);
  }
}
