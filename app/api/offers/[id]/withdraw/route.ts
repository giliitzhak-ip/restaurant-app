import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider } from '@/lib/api/guards';

/** POST /api/offers/:id/withdraw — a provider pulls back a pending offer. */
export const POST = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { supabase, providerId } = await requireProvider();

  const { data, error } = await supabase
    .from('job_offers')
    .update({ status: 'withdrawn' })
    .eq('id', id)
    .eq('provider_id', providerId)
    .eq('status', 'pending')
    .select('id, status')
    .maybeSingle();

  if (error) throw ApiError.badRequest('לא ניתן לבטל את ההצעה', error.message);
  if (!data) throw ApiError.conflict('לא ניתן לבטל הצעה שכבר טופלה');

  return jsonOk({ offer: data });
});
