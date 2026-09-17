import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireCustomer, requireServiceClient } from '@/lib/api/guards';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createReviewSchema } from '@/lib/validation/jobs';
import { getSetting } from '@/lib/services/settings';
import { detectReviewBurst } from '@/lib/services/jobs/anti-fraud';
import { notify } from '@/lib/services/notifications';
import type { ReviewCriterion } from '@/types/database';

/**
 * POST /api/jobs/:id/review — the customer rates a completed job.
 *
 * One review per job (enforced by a unique constraint). Providers can never
 * write or delete reviews; only an admin can hide one for a policy breach.
 */
export const POST = route(async (request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireCustomer();
  checkRateLimit(`reviews:${session.userId}`, RATE_LIMITS.createReview);

  const input = await parseBody(request, createReviewSchema);
  const settings = await getSetting('reviews');

  const { data: job } = await supabase
    .from('jobs')
    .select('id, status, customer_id, assigned_provider_id, completed_at, title')
    .eq('id', id)
    .maybeSingle();

  if (!job) throw ApiError.notFound('העבודה לא נמצאה');
  if (job.customer_id !== session.userId) throw ApiError.forbidden();
  if (job.status !== 'completed') throw ApiError.unprocessable('אפשר לדרג רק עבודה שהושלמה');
  if (!job.assigned_provider_id) throw ApiError.unprocessable('לעבודה אין בעל מקצוע משויך');

  if (job.completed_at) {
    const deadline =
      new Date(job.completed_at).getTime() + settings.window_days * 24 * 60 * 60 * 1000;
    if (Date.now() > deadline) {
      throw ApiError.unprocessable(`חלון הדירוג (${settings.window_days} ימים) הסתיים`);
    }
  }

  if (input.comment && input.comment.length < settings.min_comment_length) {
    throw ApiError.badRequest(`הביקורת קצרה מדי (מינימום ${settings.min_comment_length} תווים)`);
  }

  const admin = requireServiceClient();
  const burst = await detectReviewBurst(
    admin,
    session.userId,
    job.assigned_provider_id,
    await getSetting('anti_fraud'),
  );

  const { data: review, error } = await supabase
    .from('reviews')
    .insert({
      job_id: id,
      customer_id: session.userId,
      provider_id: job.assigned_provider_id,
      rating: input.rating,
      comment: input.comment ?? null,
      flagged: Boolean(burst) || input.rating < settings.auto_flag_below,
    })
    .select()
    .single();

  if (error || !review) {
    if (error?.code === '23505') throw ApiError.conflict('כבר דירגת את העבודה הזו');
    throw ApiError.badRequest('שליחת הדירוג נכשלה', error?.message);
  }

  const criteria = Object.entries(input.criteria).filter(([, score]) => typeof score === 'number');
  if (criteria.length) {
    await supabase.from('review_categories').insert(
      criteria.map(([criterion, score]) => ({
        review_id: review.id,
        criterion: criterion as ReviewCriterion,
        score: score as number,
      })),
    );
  }

  const { data: provider } = await admin
    .from('provider_profiles')
    .select('user_id, users:users!provider_profiles_user_id_fkey (email, phone)')
    .eq('id', job.assigned_provider_id)
    .maybeSingle();

  if (provider) {
    const contact = provider.users as { email: string | null; phone: string | null } | null;
    await notify({
      event: 'new_review',
      recipient: {
        userId: provider.user_id,
        email: contact?.email ?? null,
        phone: contact?.phone ?? null,
      },
      jobId: id,
      url: '/provider/profile',
      template: { rating: input.rating },
      client: admin,
    });
  }

  return jsonOk({ review, flagged: Boolean(burst) }, 201);
});
