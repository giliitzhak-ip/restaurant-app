import { z } from 'zod';
import { clientKey, fail, handleError, ok, parseJson } from '@/lib/api';
import { requestPasswordReset } from '@/domains/auth/recovery';
import { newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const bodySchema = z.object({ email: z.string().trim().email().max(320) });

/**
 * Ask for a password reset.
 *
 * Always answers the same way. "No such email" is a user-enumeration oracle,
 * and for this platform the list of who is on it is the business — so the
 * response, the status code and the timing must not depend on whether the
 * account exists.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    // Tighter than login: this one sends a message to a third party, so an
    // attacker could otherwise use it to text somebody repeatedly.
    const limit = await rateLimit(clientKey(request, 'forgot'), 5, 900);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'יותר מדי בקשות. נסו בעוד רבע שעה.', 429, requestId);
    }

    const { email } = await parseJson(request, bodySchema);
    await requestPasswordReset({
      email,
      requestedIp: request.headers.get('x-forwarded-for'),
    });

    return ok({
      sent: true,
      message: 'אם קיים חשבון עם הכתובת הזו — נשלח אליו קוד לאיפוס.',
    });
  } catch (error) {
    return handleError(error, 'auth.forgot', requestId);
  }
}
