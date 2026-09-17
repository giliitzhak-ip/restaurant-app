import { z } from 'zod';
import { clientKey, fail, handleError, ok, parseJson } from '@/lib/api';
import { completePasswordReset } from '@/domains/auth/recovery';
import { newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  // Same floor as registration: a reset must not be a way to set a weaker
  // password than the sign-up form would have accepted.
  password: z.string().min(8).max(200),
});

/** Complete a reset. Single use, and every session is revoked with it. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const limit = await rateLimit(clientKey(request, 'reset'), 10, 900);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'יותר מדי נסיונות. נסו בעוד רבע שעה.', 429, requestId);
    }

    const body = await parseJson(request, bodySchema);
    await completePasswordReset({ token: body.token, newPassword: body.password });

    // Deliberately does NOT sign them in. Whoever holds the token proved they
    // can read the message; letting the reset itself mint a session would make
    // a leaked token equivalent to a stolen account without a password.
    return ok({ reset: true, message: 'הסיסמה עודכנה. אפשר להתחבר עם הסיסמה החדשה.' });
  } catch (error) {
    return handleError(error, 'auth.reset', requestId);
  }
}
