import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { jobStatusActionSchema } from '@/lib/validation/jobs';
import { canActorTransition } from '@/lib/services/jobs/workflow';
import { notify } from '@/lib/services/notifications';
import type { ActorType } from '@/types/database';
import type { NotificationEvent as Event } from '@/lib/services/notifications/types';

const EVENT_FOR_STATUS: Partial<Record<string, Event>> = {
  provider_on_the_way: 'provider_on_the_way',
  arrived: 'provider_arrived',
};

/**
 * POST /api/jobs/:id/status — provider-driven progress updates.
 *
 * The transition is checked against the state machine AND against who the
 * caller is, so a provider cannot skip straight to `completed` (that goes
 * through /complete, which captures payment).
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, jobStatusActionSchema);

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, customer_id, assigned_provider_id')
    .eq('id', id)
    .maybeSingle();

  if (!job) throw ApiError.notFound('העבודה לא נמצאה');

  const actor: ActorType =
    session.role === 'admin'
      ? 'admin'
      : job.customer_id === session.userId
        ? 'customer'
        : 'provider';

  if (actor === 'provider' && job.assigned_provider_id !== session.providerId) {
    throw ApiError.forbidden('העבודה אינה משויכת אליך');
  }

  if (input.status === 'completed') {
    throw ApiError.badRequest('סיום עבודה מתבצע דרך /complete');
  }

  if (!canActorTransition(job.status, input.status, actor)) {
    throw ApiError.unprocessable(`לא ניתן לעבור מ-${job.status} ל-${input.status}`);
  }

  const { data: updated, error } = await supabase
    .from('jobs')
    .update({ status: input.status })
    .eq('id', id)
    .eq('status', job.status)
    .select('id, status')
    .maybeSingle();

  if (error) throw ApiError.badRequest('עדכון הסטטוס נכשל', error.message);
  if (!updated) throw ApiError.conflict('הסטטוס השתנה בינתיים. רענן ונסה שוב.');

  if (input.note) {
    // The history row is written by a trigger; attach the note to the one it
    // just created. PostgREST cannot order an UPDATE, so select the id first.
    const admin = requireServiceClient();
    const { data: entry } = await admin
      .from('job_status_history')
      .select('id')
      .eq('job_id', id)
      .eq('to_status', input.status)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entry) {
      await admin.from('job_status_history').update({ note: input.note }).eq('id', entry.id);
    }
  }

  const event = EVENT_FOR_STATUS[input.status];
  if (event) {
    const admin = requireServiceClient();
    const { data: customer } = await admin
      .from('users')
      .select('id, email, phone')
      .eq('id', job.customer_id)
      .maybeSingle();

    if (customer) {
      await notify({
        event,
        recipient: { userId: customer.id, email: customer.email, phone: customer.phone },
        jobId: id,
        url: `/app/jobs/${id}`,
        template: { providerName: session.fullName, jobTitle: job.title },
        urgent: true,
        client: admin,
      });
    }
  }

  return jsonOk({ job: updated });
});
