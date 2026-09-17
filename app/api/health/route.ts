import { route } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { env, hasServiceRole, isSupabaseConfigured } from '@/lib/env';
import { getPaymentAdapter } from '@/lib/services/payments';
import { getMapsAdapter } from '@/lib/services/maps';

/**
 * GET /api/health — which integrations are live and which are mocked.
 * Reports capability only; never a key, a URL or a secret.
 */
export const GET = route(async () => {
  const payments = getPaymentAdapter();
  const maps = getMapsAdapter();

  return jsonOk({
    status: 'ok',
    supabase: { configured: isSupabaseConfigured(), serviceRole: hasServiceRole() },
    payments: { provider: payments.name, live: payments.isLive },
    maps: { provider: maps.name, live: maps.isLive },
    notifications: { mode: env.notificationsMode },
    aiClassifier: { provider: env.aiClassifierProvider },
  });
});
