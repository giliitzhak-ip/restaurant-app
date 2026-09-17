import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { requireSession } from '@/lib/api/guards';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getMapsAdapter } from '@/lib/services/maps';

const schema = z
  .object({
    address: z.string().trim().min(2).max(300).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((value) => Boolean(value.address) || (value.lat !== undefined && value.lng !== undefined), {
    message: 'ציין כתובת או קואורדינטות',
  });

/**
 * Geocoding proxy. The maps key stays server-side; the browser only ever sees
 * results. Works without a key too — the mock adapter resolves Israeli cities.
 */
export const GET = route(async (request: NextRequest) => {
  const { session } = await requireSession();
  checkRateLimit(`geocode:${session.userId}`, RATE_LIMITS.search);

  const input = parseQuery(request, schema);
  const maps = getMapsAdapter();

  if (input.address) {
    const results = await maps.geocode(input.address);
    return jsonOk({ results, provider: maps.name, live: maps.isLive });
  }

  const result = await maps.reverseGeocode({ lat: input.lat!, lng: input.lng! });
  return jsonOk({ results: result ? [result] : [], provider: maps.name, live: maps.isLive });
});
