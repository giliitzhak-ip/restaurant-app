import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireProvider, requireSession } from '@/lib/api/guards';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createOfferSchema } from '@/lib/validation/jobs';
import { acceptsOffers } from '@/lib/services/jobs/workflow';
import { getSetting } from '@/lib/services/settings';
import { getServiceSupabase } from '@/lib/supabase/server';
import { notify } from '@/lib/services/notifications';
import { formatPrice } from '@/lib/utils/format';

/** GET /api/jobs/:id/offers — visible to the job's customer and each offerer. */
export const GET = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { supabase } = await requireSession();

  const { data, error } = await supabase
    .from('job_offers')
    .select(
      `id, price, eta_minutes, note, status, valid_until, distance_km, created_at,
       provider:provider_profiles (
         id, business_name, avatar_url, rating_avg, rating_count, completed_jobs, status
       )`,
    )
    .eq('job_id', id)
    .order('price', { ascending: true });

  if (error) throw ApiError.badRequest('לא ניתן לטעון הצעות', error.message);
  return jsonOk({ offers: data ?? [] });
});

/** POST /api/jobs/:id/offers — a matched provider quotes a price and ETA. */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase, providerId } = await requireProvider({ verified: true });
  checkRateLimit(`offers:create:${providerId}`, RATE_LIMITS.createOffer);

  const input = await parseBody(request, createOfferSchema);

  // RLS already restricts this read to jobs broadcast to this provider.
  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, customer_id, budget_max')
    .eq('id', id)
    .maybeSingle();

  if (!job) throw ApiError.notFound('העבודה לא נמצאה או שאינה משויכת אליך');
  if (!acceptsOffers(job.status)) {
    throw ApiError.unprocessable('העבודה כבר אינה מקבלת הצעות');
  }

  const { data: assignment } = await supabase
    .from('job_assignments')
    .select('id, distance_km, match_score')
    .eq('job_id', id)
    .eq('provider_id', providerId)
    .maybeSingle();

  if (!assignment) throw ApiError.forbidden('העבודה לא הוצעה לך');

  const timeouts = await getSetting('timeouts');
  const validMinutes = input.validMinutes ?? timeouts.offer_validity_minutes;

  const { data: offer, error } = await supabase
    .from('job_offers')
    .upsert(
      {
        job_id: id,
        provider_id: providerId,
        price: input.price,
        eta_minutes: input.etaMinutes,
        note: input.note ?? null,
        status: 'pending',
        valid_until: new Date(Date.now() + validMinutes * 60_000).toISOString(),
        distance_km: assignment.distance_km,
        match_score: assignment.match_score,
      },
      { onConflict: 'job_id,provider_id' },
    )
    .select()
    .single();

  if (error || !offer) throw ApiError.badRequest('שליחת ההצעה נכשלה', error?.message);

  // Moving the job to `offers_received` is a platform action, not the
  // provider's — it needs the service role to touch a job row they do not own.
  const serviceClient = getServiceSupabase();
  if (serviceClient) {
    await serviceClient
      .from('jobs')
      .update({ status: 'offers_received' })
      .eq('id', id)
      .in('status', ['requested', 'searching']);

    const { data: customer } = await serviceClient
      .from('users')
      .select('id, email, phone')
      .eq('id', job.customer_id)
      .maybeSingle();

    if (customer) {
      await notify({
        event: 'new_offer',
        recipient: { userId: customer.id, email: customer.email, phone: customer.phone },
        jobId: id,
        url: `/app/jobs/${id}`,
        template: {
          providerName: session.fullName,
          price: formatPrice(input.price),
          jobTitle: job.title,
        },
        client: serviceClient,
      });
    }
  }

  return jsonOk({ offer }, 201);
});
