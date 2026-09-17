import { z } from 'zod';
import { fail, handleError, ok, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { confirmContactCode, sendContactCode } from '@/domains/auth/recovery';
import { withUser } from '@/lib/db';
import { newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Prove that a phone number or an email address is real.
 *
 * Nothing verified either one, so anyone could register with somebody else's
 * email, and — the part that bites this product — the number a customer is
 * told to call and the number the platform texts about a job was an unchecked
 * string. A provider with a typo in their number quietly never hears about
 * work.
 */
const bodySchema = z.discriminatedUnion('action', [
  /**
   * Set or change the number.
   *
   * Registration never asked for one, so a provider had no phone at all and
   * nothing to verify. Changing it clears `phone_verified_at` — the trigger
   * added in 0036 allows clearing and forbids setting, so a client can drop
   * its own trust and never grant it.
   */
  z.object({
    action: z.literal('set-phone'),
    // Israeli mobile or landline, with or without the country code. Loose on
    // punctuation and strict on digits: rejecting a valid number is worse
    // than accepting a format we then verify by texting it.
    phone: z.string().trim().regex(/^(\+972|0)[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/, {
      message: 'מספר טלפון ישראלי, לדוגמה 050-1234567',
    }),
  }),
  z.object({ action: z.literal('send'), channel: z.enum(['sms', 'email']) }),
  z.object({
    action: z.literal('confirm'),
    channel: z.enum(['sms', 'email']),
    code: z.string().trim().regex(/^\d{6}$/),
  }),
]);

export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const row = await withUser(user.id, (db) =>
      db.one<{ phone: string | null; email: string | null; phone_ok: boolean; email_ok: boolean }>(
        `select phone, email,
                phone_verified_at is not null as phone_ok,
                email_verified_at is not null as email_ok
           from profiles where id = $1`,
        [user.id],
      ),
    );
    return ok({
      phone: row?.phone ?? null,
      email: row?.email ?? null,
      phoneVerified: row?.phone_ok ?? false,
      emailVerified: row?.email_ok ?? false,
    });
  } catch (error) {
    return handleError(error, 'auth.verify.status', requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const body = await parseJson(request, bodySchema);

    if (body.action === 'set-phone') {
      // Normalised to E.164 so the outbox has one shape to send to and two
      // spellings of one number cannot both look verified.
      const digits = body.phone.replace(/[^\d+]/g, '');
      const phone = digits.startsWith('+')
        ? digits
        : `+972${digits.replace(/^0/, '')}`;

      await withUser(user.id, (db) =>
        db.query(
          `update profiles set phone = $2, phone_verified_at = null where id = $1`,
          [user.id, phone],
        ),
      );
      return ok({ phone, phoneVerified: false });
    }

    if (body.action === 'send') {
      // Sending costs money and reaches a phone. Five an hour is generous for
      // a person and useless for anybody using us to text somebody.
      const limit = await rateLimit(`verify-send:${user.id}`, 5, 3600);
      if (!limit.allowed) {
        return fail('RATE_LIMITED', 'נשלחו יותר מדי קודים. נסו בעוד שעה.', 429, requestId);
      }
      const { destination } = await sendContactCode({ userId: user.id, channel: body.channel });
      return ok({
        sent: true,
        // Echoed as a shape so the person can tell we aimed at the right
        // place, without the response becoming a way to read back somebody's
        // contact details.
        destination: maskDestination(destination),
      });
    }

    const limit = await rateLimit(`verify-confirm:${user.id}`, 20, 3600);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'יותר מדי נסיונות. נסו בעוד שעה.', 429, requestId);
    }
    await confirmContactCode({ userId: user.id, channel: body.channel, code: body.code });
    return ok({ verified: true, channel: body.channel });
  } catch (error) {
    return handleError(error, 'auth.verify', requestId);
  }
}

function maskDestination(destination: string): string {
  if (destination.includes('@')) {
    const [local, domain] = destination.split('@');
    return `${(local ?? '').slice(0, 1)}***@${domain ?? ''}`;
  }
  return destination.length <= 4
    ? '*'.repeat(destination.length)
    : `${'*'.repeat(destination.length - 4)}${destination.slice(-4)}`;
}
