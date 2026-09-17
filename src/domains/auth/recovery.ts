import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { withSystem } from '@/lib/db';
import { queueDelivery } from '@/domains/notifications';
import { logOperation } from '@/lib/logger';

/**
 * Getting back into an account, and proving a contact detail is real.
 *
 * There was no password reset at all. A provider who forgot their password had
 * no way back in and the only recovery was an admin editing the database —
 * for a supply side of self-employed people who open the app a few times a
 * week, a slow leak of the whole network.
 *
 * Both flows run as the system, because by definition nobody is signed in
 * yet, and both deliver through the notification outbox rather than sending
 * inline: a reset that depends on an SMS gateway answering inside the request
 * is a reset that fails when the gateway is slow.
 */

const RESET_TTL_MINUTES = 30;
const CODE_TTL_MINUTES = 10;
/** Wrong codes allowed before the code is burnt. Stops guessing 000000–999999. */
const MAX_CODE_ATTEMPTS = 5;

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Start a reset.
 *
 * Returns nothing about whether the account exists, and the caller must
 * answer the same way either way. An endpoint that says "no such email" is an
 * endpoint that enumerates a platform's users, and for this product that list
 * is the business.
 */
export async function requestPasswordReset(input: {
  email: string;
  requestedIp?: string | null;
}): Promise<void> {
  await withSystem(async (db) => {
    const user = await db.one<{ id: string; phone: string | null }>(
      'select id, phone from profiles where lower(email) = lower($1)',
      [input.email],
    );
    if (!user) {
      logOperation({
        operation: 'auth.reset.request',
        result: 'invalid',
        errorCode: 'NO_SUCH_ACCOUNT',
        // No email in the log: this is the one place an attacker's guesses
        // would otherwise be collected for them.
        meta: {},
      });
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await db.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
       values ($1,$2, now() + make_interval(mins => $3), $4)`,
      [user.id, hash(token), RESET_TTL_MINUTES, input.requestedIp ?? null],
    );

    /*
     * The token travels in the notification body because that is the only
     * channel this deployment has. With the stand-in notifier it is written to
     * the log and reaches nobody — which is exactly why startup refuses to run
     * that adapter in production. A reset that goes nowhere is worse than no
     * reset at all: the user believes one is coming.
     */
    const notification = await db.one<{ id: string }>(
      `insert into notifications (user_id, kind, title, body, payload)
       values ($1,'auth.reset','איפוס סיסמה',$2,$3::jsonb)
       returning id`,
      [
        user.id,
        `קוד לאיפוס הסיסמה בתוקף ל-${RESET_TTL_MINUTES} דקות. אם לא ביקשתם — אפשר להתעלם.`,
        JSON.stringify({ token, expiresInMinutes: RESET_TTL_MINUTES }),
      ],
    );
    if (notification) {
      await queueDelivery(db, { notificationId: notification.id, userId: user.id });
    }

    logOperation({ userId: user.id, operation: 'auth.reset.request', result: 'ok', meta: {} });
  });
}

/**
 * Finish a reset.
 *
 * Single use, time limited, and it revokes every session: a reset is what
 * somebody does when they think another person has their password, so leaving
 * that person signed in would defeat the point.
 */
export async function completePasswordReset(input: {
  token: string;
  newPassword: string;
}): Promise<{ userId: string }> {
  const encrypted = await hashPassword(input.newPassword);

  return withSystem(async (db) => {
    const row = await db.one<{ id: string; user_id: string }>(
      `select id, user_id from password_reset_tokens
        where token_hash = $1 and used_at is null and expires_at > now()`,
      [hash(input.token)],
    );
    if (!row) {
      // One answer for expired, already used and never existed.
      throw new ApiError('INVALID_TOKEN', 'הקוד אינו בתוקף. בקשו קוד חדש.', 400);
    }

    await db.query('update password_reset_tokens set used_at = now() where id = $1', [row.id]);
    await db.query('update auth.users set encrypted_password = $2 where id = $1', [
      row.user_id,
      encrypted,
    ]);
    await db.query(
      `update user_sessions set revoked_at = now()
        where user_id = $1 and revoked_at is null`,
      [row.user_id],
    );

    logOperation({ userId: row.user_id, operation: 'auth.reset.complete', result: 'ok', meta: {} });

    return { userId: row.user_id };
  });
}

/** Send a six-digit code to an email address or a phone number. */
export async function sendContactCode(input: {
  userId: string;
  channel: 'sms' | 'email';
}): Promise<{ destination: string }> {
  return withSystem(async (db) => {
    const contact = await db.one<{ phone: string | null; email: string | null }>(
      'select phone, email from profiles where id = $1',
      [input.userId],
    );
    const destination = input.channel === 'sms' ? contact?.phone : contact?.email;
    if (!destination) {
      throw new ApiError(
        'NO_DESTINATION',
        input.channel === 'sms' ? 'לא נמצא מספר טלפון בחשבון' : 'לא נמצאה כתובת אימייל בחשבון',
        422,
      );
    }

    // Six digits from a CSPRNG, not Math.random: this is a credential.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

    await db.query(
      `insert into contact_verifications
         (user_id, channel, destination, code_hash, expires_at)
       values ($1,$2::delivery_channel,$3,$4, now() + make_interval(mins => $5))`,
      [input.userId, input.channel, destination, hash(code), CODE_TTL_MINUTES],
    );

    const notification = await db.one<{ id: string }>(
      `insert into notifications (user_id, kind, title, body, payload)
       values ($1,'auth.verify','אימות פרטי קשר',$2,$3::jsonb)
       returning id`,
      [
        input.userId,
        `הקוד בתוקף ל-${CODE_TTL_MINUTES} דקות.`,
        JSON.stringify({ code, channel: input.channel }),
      ],
    );
    if (notification) {
      await queueDelivery(db, {
        notificationId: notification.id,
        userId: input.userId,
        channels: [input.channel],
      });
    }

    return { destination };
  });
}

/**
 * Check a code and mark the contact detail verified.
 *
 * The comparison is constant-time and the attempt is counted before it, so a
 * wrong guess costs an attempt whether or not the code was close.
 */
export async function confirmContactCode(input: {
  userId: string;
  channel: 'sms' | 'email';
  code: string;
}): Promise<void> {
  /*
   * The attempt is counted in its OWN transaction, before the comparison.
   *
   * It was originally counted inside the same transaction as the check, which
   * looked tidier and made the cap useless: a wrong code throws, the
   * transaction rolls back, and the increment goes with it. Every guess was
   * free, so a six-digit code was a matter of patience rather than a
   * credential. Found by the test that asserted the counter, not by reading
   * the code — the bug is invisible unless you look at the row afterwards.
   *
   * This is the mirror image of the admin audit rule (D-014): there, the
   * record of a change must live or die with the change. Here, the record of
   * an attempt must survive the failure, because the failure is the thing
   * being counted.
   */
  const row = await withSystem(async (db) => {
    const found = await db.one<{
      id: string;
      code_hash: string;
      attempts: number;
      destination: string;
    }>(
      `select id, code_hash, attempts, destination
         from contact_verifications
        where user_id = $1 and channel = $2::delivery_channel
          and confirmed_at is null and expires_at > now()
        order by created_at desc limit 1`,
      [input.userId, input.channel],
    );
    if (!found) return null;
    if (found.attempts >= MAX_CODE_ATTEMPTS) return { ...found, spent: true };

    await db.query('update contact_verifications set attempts = attempts + 1 where id = $1', [
      found.id,
    ]);
    return { ...found, spent: false };
  });

  if (!row) {
    throw new ApiError('CODE_EXPIRED', 'הקוד אינו בתוקף. בקשו קוד חדש.', 400);
  }
  if (row.spent) {
    throw new ApiError('TOO_MANY_ATTEMPTS', 'יותר מדי נסיונות. בקשו קוד חדש.', 429);
  }

  const presented = Buffer.from(hash(input.code), 'hex');
  const expected = Buffer.from(row.code_hash, 'hex');
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    throw new ApiError('CODE_WRONG', 'הקוד אינו נכון', 400);
  }

  await withSystem(async (db) => {
    await db.query('update contact_verifications set confirmed_at = now() where id = $1', [row.id]);

    /*
     * Verified against the destination the code was SENT to, not against
     * whatever is on the profile now. Otherwise: request a code to a number
     * you control, change the number, enter the code, and the platform marks
     * somebody else's number verified.
     */
    const column = input.channel === 'sms' ? 'phone_verified_at' : 'email_verified_at';
    const field = input.channel === 'sms' ? 'phone' : 'email';
    await db.query(`update profiles set ${column} = now() where id = $1 and ${field} = $2`, [
      input.userId,
      row.destination,
    ]);

    logOperation({
      userId: input.userId,
      operation: 'auth.verify.confirm',
      result: 'ok',
      meta: { channel: input.channel },
    });
  });
}
