import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider } from '@/lib/api/guards';
import { declineJobSchema } from '@/lib/validation/jobs';

/**
 * POST /api/jobs/:id/decline — the provider's "לא מעוניין".
 *
 * This marks the assignment declined rather than deleting it, so the job stops
 * appearing in their feed while the match history stays auditable.
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { supabase, providerId } = await requireProvider();
  const input = await parseBody(request, declineJobSchema);

  const { data, error } = await supabase
    .from('job_assignments')
    .update({ declined_at: new Date().toISOString(), decline_reason: input.reason ?? null })
    .eq('job_id', id)
    .eq('provider_id', providerId)
    .select('id')
    .maybeSingle();

  if (error) throw ApiError.badRequest('הפעולה נכשלה', error.message);
  if (!data) throw ApiError.notFound('העבודה לא הוצעה לך');

  return jsonOk({ declined: true });
});
