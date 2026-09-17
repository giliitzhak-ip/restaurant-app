import { z } from 'zod';
import { fail, handleError, ok, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { rejectMatch } from '@/domains/jobs/reject-match';
import { logOperation, newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

/**
 * "Not this one — keep looking."
 *
 * Deliberately NOT a `transition` call: the customer's intention is "reject
 * this person", and PROVIDER_SELECTED → SEARCHING is a system transition.
 * Letting the customer drive it directly would hand them a state change the
 * state machine grants only to the system.
 *
 * The behaviour lives in `@/domains/jobs/reject-match` so it is testable
 * against a real database; this handler is auth, rate limiting and HTTP.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const user = await requireUser();
    const { id } = paramsSchema.parse(await context.params);
    const body = await parseJson(request, bodySchema).catch(() => ({ reason: undefined }));

    const limit = await rateLimit(`reject:${user.id}`, 10, 300);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'יותר מדי בקשות. נסו בעוד כמה דקות.', 429, requestId);
    }

    const result = await rejectMatch({
      jobId: id,
      customerId: user.id,
      reason: body.reason,
      requestId,
    });

    logOperation({
      requestId, userId: user.id, jobId: id,
      operation: 'jobs.rejectMatch', result: 'ok',
      durationMs: Date.now() - startedAt,
      meta: {
        rejectedProvider: result.rejectedProviderId,
        rejectionsSoFar: result.rejectionsUsed,
        offersCreated: result.dispatch?.offersCreated ?? 0,
        exhausted: result.dispatch?.exhausted ?? false,
      },
    });

    return ok(result);
  } catch (error) {
    return handleError(error, 'jobs.rejectMatch', requestId, startedAt);
  }
}
