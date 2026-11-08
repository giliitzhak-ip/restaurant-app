import type { NextRequest } from 'next/server';
import { route, type RouteParams } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireCustomer, requireServiceClient } from '@/lib/api/guards';
import { chargeCommission, getBalanceStatus, quoteCommission } from '@/lib/services/billing/ledger';
import { notify } from '@/lib/services/notifications';
import { formatPrice } from '@/lib/utils/format';
import type { JobStatus } from '@/types/database';

/**
 * POST /api/offers/:id/accept
 *
 * The commit point of the whole flow, and the only moment money changes hands
 * with GET SERVICE:
 *
 *   verify the offer is live → assign the provider (atomically, one winner)
 *   → charge the commission to the provider's prepaid balance
 *   → reject the other offers → notify both sides.
 *
 * The customer pays the provider directly for the work itself; the platform
 * never touches that. What it charges for is the introduction, taken from
 * credit the provider bought in advance.
 *
 * The price comes from the offer row, never from the request body, so a
 * tampered client cannot change what the commission is computed on.
 *
 * Assignment happens before the charge so that only one acceptance can ever
 * reach the charge; if the charge then fails the assignment is rolled back,
 * which is the only ordering where neither a double charge nor a double
 * assignment is possible.
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
    .select('id, reference, title, status, customer_id, category:categories (slug)')
    .eq('id', offer.job_id)
    .maybeSingle();

  if (!job || job.customer_id !== session.userId) throw ApiError.forbidden();
  const acceptableFrom: JobStatus[] = ['requested', 'searching', 'offers_received'];
  if (!acceptableFrom.includes(job.status)) {
    throw ApiError.conflict('כבר נבחר בעל מקצוע לעבודה הזו');
  }

  const categorySlug = (job.category as { slug: string } | null)?.slug ?? null;
  const previousStatus = job.status;

  // One winner: the status filter means a second concurrent acceptance finds
  // nothing to update and stops here, before anything is charged.
  const { data: assignedJob, error: jobError } = await admin
    .from('jobs')
    .update({
      status: 'provider_selected',
      assigned_provider_id: offer.provider_id,
      accepted_offer_id: offer.id,
    })
    .eq('id', job.id)
    .in('status', acceptableFrom)
    .select()
    .single();

  if (jobError || !assignedJob) {
    throw ApiError.conflict('לא ניתן לשבץ את בעל המקצוע. ייתכן שהעבודה כבר שובצה.');
  }

  let charge;
  try {
    charge = await chargeCommission(admin, {
      jobId: job.id,
      providerId: offer.provider_id,
      amount: Number(offer.price),
      categorySlug,
      jobReference: job.reference,
    });
  } catch (error) {
    // Put the job back the way it was so other offers stay acceptable.
    await admin
      .from('jobs')
      .update({
        status: previousStatus,
        assigned_provider_id: null,
        accepted_offer_id: null,
      })
      .eq('id', job.id);

    if (error instanceof ApiError && error.code === 'insufficient_balance') {
      // The provider's balance is their business, not the customer's. The
      // customer is told the professional is unavailable; the provider is told
      // exactly why they lost the job.
      const quote = await quoteCommission(Number(offer.price), {
        providerId: offer.provider_id,
        categorySlug,
      });
      await notifyProviderOfLostJob(admin, {
        providerId: offer.provider_id,
        jobTitle: job.title,
        commission: quote.platformFee,
      });
      await admin.from('job_offers').update({ status: 'withdrawn' }).eq('id', offer.id);

      throw new ApiError(
        409,
        'בעל המקצוע אינו זמין כרגע. בחר הצעה אחרת מהרשימה.',
        'provider_unavailable',
      );
    }
    throw error;
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

    const status = await getBalanceStatus(admin, offer.provider_id);
    if (status.state !== 'ok') {
      await notify({
        event: 'balance_low',
        recipient: {
          userId: providerUser.user_id,
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
        },
        url: '/provider/balance',
        template: { balance: formatPrice(status.balance) },
        client: admin,
      });
    }
  }

  return jsonOk({
    job: { ...assignedJob, commission_amount: charge.breakdown.platformFee },
    // The customer sees the price they agreed to, and nothing about the
    // platform's cut — that is between GET SERVICE and the provider.
    agreement: {
      price: charge.breakdown.amount,
      currency: charge.breakdown.currency,
      payTo: 'provider',
      note: 'התשלום עבור העבודה מתבצע ישירות לבעל המקצוע בתום העבודה.',
    },
  });
});

async function notifyProviderOfLostJob(
  admin: ReturnType<typeof requireServiceClient>,
  params: { providerId: string; jobTitle: string; commission: number },
) {
  const { data: provider } = await admin
    .from('provider_profiles')
    .select('user_id, users:users!provider_profiles_user_id_fkey (email, phone)')
    .eq('id', params.providerId)
    .maybeSingle();
  if (!provider) return;

  const contact = provider.users as { email: string | null; phone: string | null } | null;
  await notify({
    event: 'job_lost_no_balance',
    recipient: {
      userId: provider.user_id,
      email: contact?.email ?? null,
      phone: contact?.phone ?? null,
    },
    url: '/provider/balance',
    template: {
      jobTitle: params.jobTitle,
      commission: formatPrice(params.commission),
    },
    urgent: true,
    client: admin,
  });
}
