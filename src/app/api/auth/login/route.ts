import { cookies } from 'next/headers';
import { z } from 'zod';
import { clientKey, fail, handleError, ok, parseJson } from '@/lib/api';
import {
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  verifyPassword,
  type UserRole,
} from '@/lib/auth';
import { withSystem } from '@/lib/db';
import { logOperation, newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const bodySchema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

interface UserRow {
  id: string;
  encrypted_password: string | null;
  role: UserRole | null;
  full_name: string | null;
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    // Throttled per client to blunt credential stuffing (spec §45).
    const limit = await rateLimit(clientKey(request, 'login'), 10, 300);
    if (!limit.allowed) {
      return fail(
        'RATE_LIMITED',
        `יותר מדי נסיונות התחברות. נסו בעוד ${limit.retryAfterSeconds} שניות.`,
        429,
        requestId,
      );
    }

    const body = await parseJson(request, bodySchema);

    const row = await withSystem((db) =>
      db.one<UserRow>(
        `select u.id, u.encrypted_password, p.role, p.full_name
           from auth.users u
           left join profiles p on p.id = u.id
          where lower(u.email) = lower($1)
          limit 1`,
        [body.email],
      ),
    );

    const passwordOk = await verifyPassword(body.password, row?.encrypted_password ?? null);

    // One generic message for "no such user" and "wrong password", so the
    // endpoint cannot be used to enumerate accounts.
    if (!row || !passwordOk || !row.role) {
      logOperation({
        requestId,
        operation: 'auth.login',
        result: 'denied',
        errorCode: 'INVALID_CREDENTIALS',
        durationMs: Date.now() - startedAt,
      });
      return fail('INVALID_CREDENTIALS', 'כתובת דוא"ל או סיסמה שגויים', 401, requestId);
    }

    const session = await createSession(row.id, request.headers.get('user-agent'));
    const store = await cookies();
    store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));

    logOperation({
      requestId,
      userId: row.id,
      operation: 'auth.login',
      result: 'ok',
      durationMs: Date.now() - startedAt,
    });

    return ok({ id: row.id, role: row.role, fullName: row.full_name });
  } catch (error) {
    return handleError(error, 'auth.login', requestId, startedAt);
  }
}
