import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider } from '@/lib/api/guards';
import { availabilitySchema } from '@/lib/validation/providers';

/** GET /api/provider/availability */
export const GET = route(async () => {
  const { supabase, providerId } = await requireProvider();
  const { data } = await supabase
    .from('provider_availability')
    .select('*')
    .eq('provider_id', providerId)
    .maybeSingle();

  return jsonOk({ availability: data ?? { provider_id: providerId, is_available: false } });
});

/** PUT /api/provider/availability — the "אני זמין" toggle. */
export const PUT = route(async (request: NextRequest) => {
  const { session, supabase, providerId } = await requireProvider();
  const input = await parseBody(request, availabilitySchema);

  // Only a verified provider can go online; otherwise matching would surface
  // an unvetted business to customers.
  if (input.isAvailable && session.providerStatus !== 'verified') {
    throw ApiError.forbidden('אפשר להיות זמין רק לאחר אימות החשבון');
  }

  const { data, error } = await supabase
    .from('provider_availability')
    .upsert(
      {
        provider_id: providerId,
        is_available: input.isAvailable,
        available_until: input.availableUntil ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider_id' },
    )
    .select()
    .single();

  if (error) throw ApiError.badRequest('עדכון הזמינות נכשל', error.message);
  return jsonOk({ availability: data });
});
