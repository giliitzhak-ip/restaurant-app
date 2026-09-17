import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireCustomer, requireSession } from '@/lib/api/guards';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createJobSchema, listJobsSchema } from '@/lib/validation/jobs';
import { getServiceSupabase } from '@/lib/supabase/server';
import { getSetting } from '@/lib/services/settings';
import { detectDuplicateJob } from '@/lib/services/jobs/anti-fraud';
import { discoverProviders, broadcastJob } from '@/lib/services/matching/discovery';
import { notify, notifyMany } from '@/lib/services/notifications';
import { ACTIVE_STATUSES } from '@/lib/services/jobs/workflow';

const JOB_SELECT = `
  id, reference, title, description, status, urgency, scheduled_for, address, lat, lng,
  budget_min, budget_max, created_at, updated_at, completed_at, final_price,
  category:categories (id, name, slug, icon),
  service:services (id, name, slug),
  assigned_provider:provider_profiles (id, business_name, avatar_url, rating_avg, rating_count, phone),
  job_offers (id),
  job_images (id, storage_path, kind)
`;

/** POST /api/jobs — a customer opens a service request. */
export const POST = route(async (request: NextRequest) => {
  const { session, supabase } = await requireCustomer();
  checkRateLimit(`jobs:create:${session.userId}`, RATE_LIMITS.createJob);

  const input = await parseBody(request, createJobSchema);
  const antiFraud = await getSetting('anti_fraud');

  const duplicate = await detectDuplicateJob(
    supabase,
    session.userId,
    input.categoryId,
    input.description,
    antiFraud,
  );
  if (duplicate) throw ApiError.conflict(duplicate.message);

  const { data: category } = await supabase
    .from('categories')
    .select('id, slug, active')
    .eq('id', input.categoryId)
    .maybeSingle();
  if (!category?.active) throw ApiError.badRequest('הקטגוריה שנבחרה אינה זמינה');

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      customer_id: session.userId,
      category_id: input.categoryId,
      service_id: input.serviceId ?? null,
      title: input.title,
      description: input.description,
      urgency: input.urgency,
      scheduled_for: input.scheduledFor ?? null,
      address: input.address,
      address_notes: input.addressNotes ?? null,
      lat: input.lat,
      lng: input.lng,
      budget_min: input.budgetMin ?? null,
      budget_max: input.budgetMax ?? null,
      status: 'requested',
    })
    .select('*')
    .single();

  if (error || !job) throw ApiError.badRequest('לא ניתן לפתוח את הבקשה', error?.message);

  if (input.media.length) {
    await supabase.from('job_images').insert(
      input.media.map((item, index) => ({
        job_id: job.id,
        storage_path: item.storagePath,
        kind: item.kind,
        sort_order: index,
      })),
    );
  }

  await notify({
    event: 'job_created',
    recipient: { userId: session.userId, email: session.email, phone: session.phone },
    jobId: job.id,
    url: `/app/jobs/${job.id}`,
    template: { jobTitle: job.title },
  });

  // Matching runs with the service role: it must see providers the customer
  // cannot query, and writing `job_assignments` is what grants them access.
  const serviceClient = getServiceSupabase();
  let matchedCount = 0;

  if (serviceClient) {
    try {
      const result = await discoverProviders(job, serviceClient);
      const userIds = await broadcastJob(job.id, result, serviceClient);
      matchedCount = userIds.length;

      if (userIds.length) {
        const { data: contacts } = await serviceClient
          .from('users')
          .select('id, email, phone')
          .in('id', userIds);

        await notifyMany(
          (contacts ?? []).map((contact) => ({
            userId: contact.id,
            email: contact.email,
            phone: contact.phone,
          })),
          {
            event: 'new_job_for_provider',
            jobId: job.id,
            url: `/provider/jobs/${job.id}`,
            template: { jobTitle: job.title },
            urgent: job.urgency === 'now',
            client: serviceClient,
          },
        );
      }
    } catch (matchError) {
      // A matching failure must not lose the customer's request: the job stays
      // in `requested` and can be re-broadcast.
      console.error('[jobs] matching failed', matchError);
    }
  }

  return jsonOk({ job, matchedProviders: matchedCount }, 201);
});

/** GET /api/jobs — the caller's own jobs (customer view). */
export const GET = route(async (request: NextRequest) => {
  const { session, supabase } = await requireSession();
  const { status, page, pageSize } = parseQuery(request, listJobsSchema);

  let query = supabase
    .from('jobs')
    .select(JOB_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (session.role === 'customer') {
    query = query.eq('customer_id', session.userId);
  } else if (session.role === 'provider' && session.providerId) {
    query = query.eq('assigned_provider_id', session.providerId);
  }

  if (status === 'active') query = query.in('status', ACTIVE_STATUSES);
  else if (status !== 'all') query = query.eq('status', status);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw ApiError.badRequest('לא ניתן לטעון את העבודות', error.message);

  return jsonOk({ jobs: data ?? [], total: count ?? 0, page, pageSize });
});
