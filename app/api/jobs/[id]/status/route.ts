import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireSession, requireServiceClient } from '@/lib/api/guards';
import { jobStatusActionSchema } from '@/lib/validation/jobs';
import { canActorTransition } from '@/lib/services/jobs/workflow';
import { checkArrival } from '@/lib/services/jobs/verification';
import { getSetting } from '@/lib/services/settings';
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
 * through /complete).
 *
 * `arrived` is the one status with teeth. A provider pressing "I've arrived"
 * proves nothing on its own, so the request carries the device's coordinates
 * and the server compares them with the job's address. The distance is stored
 * either way: a check-in 40 metres off is a parked van, one 40 kilometres off
 * is something else, and the difference is only visible if both are recorded.
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireSession();
  const input = await parseBody(request, jobStatusActionSchema);

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, customer_id, assigned_provider_id, lat, lng')
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

  const patch: {
    status: typeof input.status;
    arrival_lat?: number;
    arrival_lng?: number;
    arrival_distance_m?: number;
    arrival_verified_at?: string | null;
  } = { status: input.status };

  let arrival: ReturnType<typeof checkArrival> | null = null;

  if (input.status === 'arrived' && actor === 'provider') {
    const verification = await getSetting('verification');
    const hasCheckin = input.lat !== undefined && input.lng !== undefined;

    if (verification.require_arrival_checkin && !hasCheckin) {
      throw ApiError.badRequest(
        'כדי לסמן הגעה יש לאשר שיתוף מיקום. המיקום נשמר רק לאימות ההגעה לכתובת.',
      );
    }

    if (hasCheckin) {
      arrival = checkArrival(
        { lat: Number(job.lat), lng: Number(job.lng) },
        { lat: input.lat, lng: input.lng },
        verification,
      );

      if (!arrival.ok) {
        throw ApiError.badRequest('המיקום שנשלח אינו תקין');
      }

      patch.arrival_lat = input.lat;
      patch.arrival_lng = input.lng;
      patch.arrival_distance_m = arrival.distanceM;
      patch.arrival_verified_at = arrival.verified ? new Date().toISOString() : null;
    }
  }

  const { data: updated, error } = await supabase
    .from('jobs')
    .update(patch)
    .eq('id', id)
    .eq('status', job.status)
    .select('id, status, arrival_distance_m, arrival_verified_at')
    .maybeSingle();

  if (error) throw ApiError.badRequest('עדכון הסטטוס נכשל', error.message);
  if (!updated) throw ApiError.conflict('הסטטוס השתנה בינתיים. רענן ונסה שוב.');

  // The note, and the arrival distance when there is one, are recorded on the
  // history row the status trigger just wrote — so the timeline keeps the
  // evidence next to the event it belongs to.
  const historyNote = [
    input.note,
    arrival?.ok
      ? `אימות הגעה: ${arrival.distanceM} מ' מהכתובת (סבילות ${arrival.toleranceM} מ')` +
        (arrival.verified ? '' : ' — מחוץ לטווח')
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (historyNote) {
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
      await admin.from('job_status_history').update({ note: historyNote }).eq('id', entry.id);
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

  return jsonOk({
    job: updated,
    // The provider sees how their own check-in landed; the customer sees only
    // that the provider arrived.
    arrival: arrival?.ok
      ? {
          distanceM: arrival.distanceM,
          toleranceM: arrival.toleranceM,
          verified: arrival.verified,
        }
      : null,
  });
});
