import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import { logOperation, newRequestId } from '@/lib/logger';

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ reason: z.string().trim().max(300).optional() }).default({});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');
    const { id } = paramsSchema.parse(await context.params);
    const body = await parseJson(request, bodySchema).catch(() => ({ reason: undefined }));

    // RLS restricts this UPDATE to the provider's own offer rows, so a
    // provider cannot decline — or otherwise touch — anyone else's offer.
    const updated = await withUser(user.id, (db) =>
      db.one<{ id: string; job_id: string }>(
        `update job_offers
            set status = 'DECLINED', responded_at = now(), decline_reason = $2
          where id = $1 and status = 'PENDING'
          returning id, job_id`,
        [id, body.reason ?? null],
      ),
    );

    if (!updated) {
      throw new ApiError('OFFER_NOT_PENDING', 'ההצעה כבר טופלה או פגה', 409);
    }

    await withSystem(async (db) => {
      await db.query(
        `update matching_events
            set rejected = true, responded_at = now(),
                response_seconds = extract(epoch from (now() - coalesce(notified_at, now())))
          where offer_id = $1`,
        [id],
      );
    });

    logOperation({
      requestId, userId: user.id, providerId: user.id, jobId: updated.job_id,
      operation: 'offers.decline', result: 'ok',
    });

    return ok({ id: updated.id, status: 'DECLINED' });
  } catch (error) {
    return handleError(error, 'offers.decline', requestId);
  }
}
