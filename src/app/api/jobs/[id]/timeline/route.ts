import { z } from 'zod';
import { handleError, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { newRequestId } from '@/lib/logger';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * The job's audit timeline (spec §26).
 *
 * Read through the user's own connection, so RLS restricts it to
 * participants. The rows are written by a database trigger and users have no
 * INSERT privilege, so this is a genuine audit trail rather than a log the
 * client could shape.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const { id } = paramsSchema.parse(await context.params);

    const events = await withUser(user.id, (db) =>
      db.many(
        `select h.id, h.from_status::text as from_status, h.to_status::text as to_status,
                h.actor_role, h.reason, h.created_at,
                p.full_name as actor_name
           from job_status_history h
           left join profiles p on p.id = h.actor_id
          where h.job_id = $1
          order by h.created_at asc`,
        [id],
      ),
    );

    return ok({ events });
  } catch (error) {
    return handleError(error, 'jobs.timeline', requestId);
  }
}
