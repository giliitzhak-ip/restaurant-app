import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  completePasswordReset,
  confirmContactCode,
  requestPasswordReset,
  sendContactCode,
} from '@/domains/auth/recovery';
import { assertPhoneVerified } from '@/domains/documents';
import { createSession, resolveSessionToken, verifyPassword } from '@/lib/auth';
import { getPool, withSystem } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createProvider,
} from '../helpers/fixtures';

/**
 * Account recovery and contact verification (migration 0036).
 *
 * There was no password reset: a provider who forgot their password had no way
 * back in, and the only recovery was an admin editing the database. And
 * nothing verified a phone number — the number a customer is told to call and
 * the number the outbox texts about a job was an unchecked string.
 */
describe('account recovery', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  /** The token only exists in the notification payload, as it does in life. */
  const tokenFor = async (userId: string) => {
    const { rows } = await adminPool().query<{ payload: { token: string } }>(
      `select payload from notifications
        where user_id = $1 and kind = 'auth.reset' order by created_at desc limit 1`,
      [userId],
    );
    return rows[0]?.payload.token ?? null;
  };

  const codeFor = async (userId: string) => {
    const { rows } = await adminPool().query<{ payload: { code: string } }>(
      `select payload from notifications
        where user_id = $1 and kind = 'auth.verify' order by created_at desc limit 1`,
      [userId],
    );
    return rows[0]?.payload.code ?? null;
  };

  const emailOf = async (userId: string) => {
    const { rows } = await adminPool().query<{ email: string }>(
      'select email from profiles where id = $1',
      [userId],
    );
    return rows[0]!.email;
  };

  const storedPassword = async (userId: string) => {
    const { rows } = await adminPool().query<{ encrypted_password: string }>(
      'select encrypted_password from auth.users where id = $1',
      [userId],
    );
    return rows[0]!.encrypted_password;
  };

  it('a reset changes the password, works once, and revokes every session', async () => {
    const provider = await createProvider({ name: 'שכחתי', lat: 32.075, lon: 34.775 });
    // A session from before the reset: somebody else may be holding it, which
    // is usually why a person resets in the first place.
    const old = await createSession(provider.id);
    expect(await resolveSessionToken(old.token)).not.toBeNull();

    await requestPasswordReset({ email: await emailOf(provider.id) });
    const token = await tokenFor(provider.id);
    expect(token).toBeTruthy();

    await completePasswordReset({ token: token!, newPassword: 'a-brand-new-password' });

    expect(await verifyPassword('a-brand-new-password', await storedPassword(provider.id)))
      .toBe(true);
    // The old session is gone: a reset that leaves the intruder signed in has
    // not done anything.
    expect(await resolveSessionToken(old.token)).toBeNull();

    // Single use.
    await expect(
      completePasswordReset({ token: token!, newPassword: 'another-one-entirely' }),
    ).rejects.toThrow(/INVALID_TOKEN|בתוקף/);
  });

  it('an unknown email is indistinguishable from a known one', async () => {
    // No throw, no signal, nothing written: "no such email" is a
    // user-enumeration oracle, and for this platform that list is the
    // business.
    await expect(
      requestPasswordReset({ email: 'nobody-at-all@example.com' }),
    ).resolves.toBeUndefined();

    const { rows } = await adminPool().query('select 1 from password_reset_tokens');
    expect(rows).toHaveLength(0);
  });

  it('an expired token is refused', async () => {
    const provider = await createProvider({ name: 'שכחתי', lat: 32.075, lon: 34.775 });
    await requestPasswordReset({ email: await emailOf(provider.id) });
    const token = await tokenFor(provider.id);

    await adminPool().query(
      `update password_reset_tokens set expires_at = now() - interval '1 minute'
        where user_id = $1`,
      [provider.id],
    );

    await expect(
      completePasswordReset({ token: token!, newPassword: 'too-late-for-this' }),
    ).rejects.toThrow(/INVALID_TOKEN|בתוקף/);
  });

  it('the token is stored hashed, so a dump is not a list of working resets', async () => {
    const provider = await createProvider({ name: 'שכחתי', lat: 32.075, lon: 34.775 });
    await requestPasswordReset({ email: await emailOf(provider.id) });
    const token = await tokenFor(provider.id);

    const { rows } = await adminPool().query<{ token_hash: string }>(
      'select token_hash from password_reset_tokens where user_id = $1',
      [provider.id],
    );
    expect(rows[0]!.token_hash).not.toBe(token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a phone code verifies the number, and a wrong one costs an attempt', async () => {
    const provider = await createProvider({ name: 'מאמת', lat: 32.075, lon: 34.775 });
    await adminPool().query('update profiles set phone = $2 where id = $1', [
      provider.id, '+972501234567',
    ]);

    await sendContactCode({ userId: provider.id, channel: 'sms' });
    const code = await codeFor(provider.id);
    expect(code).toMatch(/^\d{6}$/);

    await expect(
      confirmContactCode({ userId: provider.id, channel: 'sms', code: '000000' }),
    ).rejects.toThrow(/CODE_WRONG|נכון/);

    const { rows: attempted } = await adminPool().query<{ attempts: number }>(
      'select attempts from contact_verifications where user_id = $1',
      [provider.id],
    );
    // Counted before the comparison, so a wrong guess costs an attempt
    // whether or not it was close.
    expect(attempted[0]!.attempts).toBe(1);

    await confirmContactCode({ userId: provider.id, channel: 'sms', code: code! });
    const { rows } = await adminPool().query<{ verified: boolean }>(
      'select phone_verified_at is not null as verified from profiles where id = $1',
      [provider.id],
    );
    expect(rows[0]!.verified).toBe(true);
  });

  it('SECURITY: a code sent to one number does not verify another', async () => {
    const provider = await createProvider({ name: 'מחליף', lat: 32.075, lon: 34.775 });
    await adminPool().query('update profiles set phone = $2 where id = $1', [
      provider.id, '+972500000001',
    ]);
    await sendContactCode({ userId: provider.id, channel: 'sms' });
    const code = await codeFor(provider.id);

    // The attack: get a code to a number you control, change the number to
    // somebody else's, then enter the code.
    await adminPool().query('update profiles set phone = $2 where id = $1', [
      provider.id, '+972509999999',
    ]);
    await confirmContactCode({ userId: provider.id, channel: 'sms', code: code! });

    const { rows } = await adminPool().query<{ verified: boolean; phone: string }>(
      'select phone_verified_at is not null as verified, phone from profiles where id = $1',
      [provider.id],
    );
    // The code was right, so it is consumed — and the number it was not sent
    // to stays unverified.
    expect(rows[0]!.phone).toBe('+972509999999');
    expect(rows[0]!.verified).toBe(false);
  });

  it('a code burns out after five wrong guesses', async () => {
    const provider = await createProvider({ name: 'מנחש', lat: 32.075, lon: 34.775 });
    await adminPool().query('update profiles set phone = $2 where id = $1', [
      provider.id, '+972501234567',
    ]);
    await sendContactCode({ userId: provider.id, channel: 'sms' });
    const code = await codeFor(provider.id);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        confirmContactCode({ userId: provider.id, channel: 'sms', code: '111111' }),
      ).rejects.toThrow();
    }
    // Even the right code, now: a million-value space needs a cap or it is a
    // matter of patience.
    await expect(
      confirmContactCode({ userId: provider.id, channel: 'sms', code: code! }),
    ).rejects.toThrow(/TOO_MANY_ATTEMPTS|נסיונות/);
  });

  it('verification is refused while the phone is unverified', async () => {
    const provider = await createProvider({ name: 'לא אומת', lat: 32.075, lon: 34.775 });
    await withSystem(async (db) => {
      await expect(assertPhoneVerified(db, provider.id)).rejects.toThrow(
        /PHONE_REQUIRED|טלפון/,
      );
    });

    await adminPool().query('update profiles set phone = $2 where id = $1', [
      provider.id, '+972501234567',
    ]);
    await withSystem(async (db) => {
      await expect(assertPhoneVerified(db, provider.id)).rejects.toThrow(
        /PHONE_NOT_VERIFIED|אומת/,
      );
    });

    await sendContactCode({ userId: provider.id, channel: 'sms' });
    await confirmContactCode({
      userId: provider.id, channel: 'sms', code: (await codeFor(provider.id))!,
    });
    await withSystem(async (db) => {
      await expect(assertPhoneVerified(db, provider.id)).resolves.toBeUndefined();
    });
  });

  it('a code with nowhere to go is refused rather than invented', async () => {
    const provider = await createProvider({ name: 'ללא טלפון', lat: 32.075, lon: 34.775 });
    await adminPool().query('update profiles set phone = null where id = $1', [provider.id]);
    await expect(
      sendContactCode({ userId: provider.id, channel: 'sms' }),
    ).rejects.toThrow(/NO_DESTINATION|טלפון/);
  });
});
