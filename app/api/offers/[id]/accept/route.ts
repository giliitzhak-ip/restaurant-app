import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireCustomer, requireServiceClient } from '@/lib/api/guards';
import { createPaymentForJob } from '@/lib/services/payments/flow';
import { notify } from '@/lib/services/notifications';
import { getPaymentAdapter } from '@/lib/services/payments';
import { formatPrice } from '@/lib/utils/format';

/**
 * POST /api/offers/:id/accept
 *
 * The commit point of the whole flow:
 *   verify the offer is still live → authorise payment for the OFFERED amount
 *   → assign the provider → reject the other offers → notify both sides.
 *
 * The price comes from the offer row, never from the request body, so a
 * tampered client cannot pay less than was quoted.
 */
export const POST = route(async (_request: NextRequest, { params }: RouteParams<{ id: string }>) => {
  const { id } = await params;
  const { session, supabase } = await requireCustomer();
  const admin = requireServiceClient();

  const { data: offer } = await supabase
    .from('job_offers')
    .select('id, job_id, provider_id, price, eta_minutes, status, valid_until')
    .eq('id', id)
    .maybeSingle();

  if (!offer) throw ApiError.notFound('ההצעה לא נמצאה');
  if (offer.status !== 'pending') throw ApiError.conflict('ההצעה כבר אינה זמינה');
  if (new Date(offer.valid_until).getTime() < Date.now()) {
    throw ApiError.conflict('תוקף ההצעה פג');
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, customer_id, category:categories (slug)')
    .eq('id', offer.job_id)
    .maybeSingle();

  if (!job || job.customer_id !== session.userId) throw ApiError.forbidden();
  if (!['requested', 'searching', 'offers_received'].includes(job.status)) {
    throw ApiError.conflict('כבר נבחר בעל מקצוע לעבודה הזו');
  }

  const categorySlug = (job.category as { slug: string } | null)?.slug ?? null;

  const { breakdown, mocked } = await createPaymentForJob(admin, {
    jobId: job.id,
    customerId: session.userId,
    providerId: offer.provider_id,
    amount: Number(offer.price),
    categorySlug,
    customerEmail: session.email,
    customerName: session.fullName,
    description: `GET SERVICE — ${job.title}`,
  });

  const { data: updatedJob, error: jobError } = await admin
    .from('jobs')
    .update({
      status: 'provider_selected',
      assigned_provider_id: offer.provider_id,
      accepted_offer_id: offer.id,
      final_price: breakdown.amount,
      platform_fee: breakdown.platformFee,
      provider_payout: breakdown.providerPayout,
    })
    .eq('id', job.id)
    .in('status', ['requested', 'searching', 'offers_received'])
    .select()
    .single();

  if (jobError || !updatedJob) {
    throw ApiError.conflict('לא ניתן לשבץ את בעל המקצוע. ייתכן שהעבודה כבר שובצה.');
  }

  await admin.from('job_offers').update({ status: 'accepted' }).eq('id', offer.id);
  await admin
    .from('job_offers')
    .update({ status: 'rejected' })
    .eq('job_id', job.id)
    .neq('id', offer.id)
    .eq('status', 'pending');

  const { data: providerUser } = await admin
    .from('provider_profiles')
    .select('user_id, business_name, users:users!provider_profiles_user_id_fkey (email, phone)')
    .eq('id', offer.provider_id)
    .maybeSingle();

  if (providerUser) {
    const contact = providerUser.users as { email: string | null; phone: string | null } | null;
    await notify({
      event: 'offer_accepted',
      recipient: {
        userId: providerUser.user_id,
        email: contact?.email ?? null,
        phone: contact?.phone ?? null,
      },
      jobId: job.id,
      url: `/provider/jobs/${job.id}`,
      template: { customerName: session.fullName, jobTitle: job.title },
      urgent: true,
      client: admin,
    });
  }

  await notify({
    event: 'payment_completed',
    recipient: { userId: session.userId, email: session.email, phone: session.phone },
    jobId: job.id,
    url: `/app/jobs/${job.id}`,
    template: { price: formatPrice(breakdown.amount) },
    client: admin,
  });

  return jsonOk({
    job: updatedJob,
    payment: {
      amount: breakdown.amount,
      platformFee: breakdown.platformFee,
      providerPayout: breakdown.providerPayout,
      currency: breakdown.currency,
      status: 'authorized',
      mocked,
      provider: getPaymentAdapter().name,
    },
  });
});
