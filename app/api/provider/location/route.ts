import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider } from '@/lib/api/guards';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { locationUpdateSchema } from '@/lib/validation/providers';

/**
 * PUT /api/provider/location
 *
 * Position is stored only while it serves the operation of the service: the
 * provider must be marked available or have a live job. Otherwise the stored
 * row is cleared rather than kept.
 */
export const PUT = route(async (request: NextRequest) => {
  const { supabase, providerId } = await requireProvider();
  checkRateLimit(`location:${providerId}`, RATE_LIMITS.updateLocation);

  const input = await parseBody(request, locationUpdateSchema);

  const [{ data: availability }, { count: liveJobs }] = await Promise.all([
    supabase.from('provider_availability').select('is_available').eq('provider_id', providerId).maybeSingle(),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_provider_id', providerId)
      .in('status', ['provider_selected', 'provider_on_the_way', 'arrived', 'in_progress']),
  ]);

  const shouldStore = Boolean(availability?.is_available) || (liveJobs ?? 0) > 0;

  if (!shouldStore) {
    await supabase.from('provider_locations').delete().eq('provider_id', providerId);
    return jsonOk({ stored: false, reason: 'not_available' });
  }

  const { error } = await supabase.from('provider_locations').upsert(
    {
      provider_id: providerId,
      lat: input.lat,
      lng: input.lng,
      accuracy_m: input.accuracyM ?? null,
      heading: input.heading ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider_id' },
  );

  if (error) throw ApiError.badRequest('עדכון המיקום נכשל', error.message);
  return jsonOk({ stored: true });
});

/** DELETE /api/provider/location — stop sharing position. */
export const DELETE = route(async () => {
  const { supabase, providerId } = await requireProvider();
  await supabase.from('provider_locations').delete().eq('provider_id', providerId);
  return jsonOk({ stored: false });
});
