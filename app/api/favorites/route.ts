import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireCustomer } from '@/lib/api/guards';
import { uuidSchema } from '@/lib/validation/common';

export const GET = route(async () => {
  const { session, supabase } = await requireCustomer();

  const { data, error } = await supabase
    .from('favorites')
    .select(
      `id, created_at,
       provider:provider_profiles (
         id, business_name, avatar_url, bio, base_price, rating_avg, rating_count,
         completed_jobs, status,
         provider_categories (categories (id, name, slug)),
         provider_availability (is_available)
       )`,
    )
    .eq('customer_id', session.userId)
    .order('created_at', { ascending: false });

  if (error) throw ApiError.badRequest('לא ניתן לטעון מועדפים', error.message);
  return jsonOk({ favorites: data ?? [] });
});

export const POST = route(async (request: NextRequest) => {
  const { session, supabase } = await requireCustomer();
  const { providerId } = await parseBody(request, z.object({ providerId: uuidSchema }));

  const { data, error } = await supabase
    .from('favorites')
    .upsert(
      { customer_id: session.userId, provider_id: providerId },
      { onConflict: 'customer_id,provider_id', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();

  if (error) throw ApiError.badRequest('ההוספה למועדפים נכשלה', error.message);
  return jsonOk({ favorite: data, saved: true }, 201);
});

export const DELETE = route(async (request: NextRequest) => {
  const { session, supabase } = await requireCustomer();
  const { providerId } = parseQuery(request, z.object({ providerId: uuidSchema }));

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('customer_id', session.userId)
    .eq('provider_id', providerId);

  if (error) throw ApiError.badRequest('ההסרה מהמועדפים נכשלה', error.message);
  return jsonOk({ saved: false });
});
