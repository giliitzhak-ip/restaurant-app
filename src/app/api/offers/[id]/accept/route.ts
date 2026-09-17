import { z } from 'zod';
import { handleError, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import { logOperation, newRequestId } from '@/lib/logger';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Provider accepts an offer (spec §25).
 *
 * The entire decision happens inside accept_job_offer(), one transactional
 * database function. That is what makes the guarantee real rather than
 * hopeful: two providers accepting simultaneously are serialised by a row
 * lock on the job, and the UNIQUE constraint on job_assignments.job_id is a
 * second, independent backstop. The loser receives JOB_ALREADY_ASSIGNED,
 * which handleError maps to a clean 409.
 *
 * An expired or already-answered offer cannot be accepted, and a provider
 * cannot accept someone else's offer — both enforced in the function, not
 * here.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const user = await requireRole('provider');
    const { id } = paramsSchema.parse(await context.params);

    const result = await withUser(user.id, (db) =>
      db.one<{ accept_job_offer: Record<string, unknown> }>(
        'select accept_job_offer($1) as accept_job_offer',
        [id],
      ),
    );

    const assignment = result?.accept_job_offer ?? {};
    const jobId = typeof assignment.job_id === 'string' ? assignment.job_id : null;

    // Tell the customer they have a match. Done as the system because the
    // notification targets a user the provider cannot write rows for.
    if (jobId) {
      await withSystem(async (db) => {
        await db.query(
          `insert into notifications (user_id, job_id, kind, title, body)
           select j.customer_id, j.id, 'job.matched', 'מצאנו לך מקצוען',
                  'המקצוען אישר את הקריאה. נותר רק לאשר.'
             from jobs j where j.id = $1`,
          [jobId],
        );
      });
    }

    logOperation({
      requestId, userId: user.id, providerId: user.id, jobId,
      operation: 'offers.accept', result: 'ok',
      durationMs: Date.now() - startedAt,
    });

    return ok(assignment);
  } catch (error) {
    return handleError(error, 'offers.accept', requestId, startedAt);
  }
}
