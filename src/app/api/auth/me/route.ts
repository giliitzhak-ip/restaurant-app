import { handleError, ok } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { newRequestId } from '@/lib/logger';

export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await getCurrentUser();
    return ok({ user });
  } catch (error) {
    return handleError(error, 'auth.me', requestId);
  }
}
