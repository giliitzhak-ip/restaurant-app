import { cookies } from 'next/headers';
import { handleError, ok } from '@/lib/api';
import { revokeSession, SESSION_COOKIE } from '@/lib/auth';
import { newRequestId } from '@/lib/logger';

export async function POST() {
  const requestId = newRequestId();
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) await revokeSession(token);
    store.delete(SESSION_COOKIE);
    return ok({ ok: true });
  } catch (error) {
    return handleError(error, 'auth.logout', requestId);
  }
}
