import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireCustomer } from '@/lib/api/guards';

/** POST /api/offers/:id/reject — the customer declines one offer. */
export const POST = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { supabase } = await requireCustomer();

  const { data, error } = await supabase
    .from('job_offers')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, status')
    .maybeSingle();

  if (error) throw ApiError.badRequest('לא ניתן לדחות את ההצעה', error.message);
  if (!data) throw ApiError.conflict('ההצעה כבר אינה ממתינה');

  return jsonOk({ offer: data });
});
