import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { logAdminAction, requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { resolveDisputeSchema } from '@/lib/validation/admin';

/** PUT /api/admin/disputes/:id — move a dispute through its lifecycle. */
export const PUT = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session } = await requireAdmin();
  const admin = requireServiceClient();
  const input = await parseBody(request, resolveDisputeSchema);

  const resolved = input.status === 'resolved' || input.status === 'rejected';

  const { data, error } = await admin
    .from('disputes')
    .update({
      status: input.status,
      resolution: input.resolution ?? null,
      resolved_by: resolved ? session.userId : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('id, status, job_id')
    .single();

  if (error || !data) throw ApiError.badRequest('עדכון התלונה נכשל', error?.message);

  // Once the dispute is closed the job returns to `completed` so it stops
  // sitting in a disputed limbo.
  if (resolved) {
    await admin.from('jobs').update({ status: 'completed' }).eq('id', data.job_id).eq('status', 'disputed');
  }

  await logAdminAction(session.userId, 'dispute_update', 'disputes', id, {
    status: input.status,
    resolution: input.resolution ?? null,
  });

  return jsonOk({ dispute: data });
});
