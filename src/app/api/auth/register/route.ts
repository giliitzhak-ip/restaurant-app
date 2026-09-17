import { cookies } from 'next/headers';
import { z } from 'zod';
import { ApiError, clientKey, fail, handleError, ok, parseJson } from '@/lib/api';
import { createSession, hashPassword, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth';
import { withSystem } from '@/lib/db';
import { logOperation, newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'מספר טלפון לא תקין')
    .optional(),
  // A client may ask to be a customer or a provider. It may NEVER ask to be
  // an admin: admin is granted out of band (spec §23, §45).
  role: z.enum(['customer', 'provider']).default('customer'),
});

export async function POST(request: Request) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    const limit = await rateLimit(clientKey(request, 'register'), 5, 600);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'יותר מדי נסיונות. נסו בעוד כמה דקות.', 429, requestId);
    }

    const body = await parseJson(request, bodySchema);
    const encrypted = await hashPassword(body.password);

    const userId = await withSystem(async (db) => {
      const existing = await db.one<{ id: string }>(
        'select id from auth.users where lower(email) = lower($1)',
        [body.email],
      );
      if (existing) {
        throw new ApiError('EMAIL_TAKEN', 'כבר קיים חשבון עם כתובת הדוא"ל הזו', 409);
      }

      const user = await db.one<{ id: string }>(
        `insert into auth.users (email, phone, encrypted_password)
         values ($1, $2, $3) returning id`,
        [body.email, body.phone ?? null, encrypted],
      );
      if (!user) throw new Error('Failed to create user');

      await db.query(
        `insert into profiles (id, role, full_name, phone, email)
         values ($1, $2, $3, $4, $5)`,
        [user.id, body.role, body.fullName, body.phone ?? null, body.email],
      );

      if (body.role === 'customer') {
        await db.query('insert into customer_profiles (id) values ($1)', [user.id]);
      } else {
        // A new provider starts PENDING and cannot receive work until an
        // admin verifies them (spec §31).
        await db.query(
          `insert into provider_profiles (id, verification) values ($1, 'PENDING')`,
          [user.id],
        );
      }

      return user.id;
    });

    const session = await createSession(userId, request.headers.get('user-agent'));
    const store = await cookies();
    store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));

    logOperation({
      requestId,
      userId,
      operation: 'auth.register',
      result: 'ok',
      durationMs: Date.now() - startedAt,
      meta: { role: body.role },
    });

    return ok({ id: userId, role: body.role, fullName: body.fullName }, { status: 201 });
  } catch (error) {
    return handleError(error, 'auth.register', requestId, startedAt);
  }
}
