import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { requireProvider, requireServiceClient } from '@/lib/api/guards';
import { startTopup } from '@/lib/services/billing/topup';
import { getBalanceStatus } from '@/lib/services/billing/ledger';
import { getPaymentAdapter } from '@/lib/services/payments';
import { notify } from '@/lib/services/notifications';
import { formatPrice } from '@/lib/utils/format';

const topupSchema = z.object({
  amount: z
    .number({ message: 'בחר סכום' })
    .positive('הסכום חייב להיות חיובי')
    .max(20000, 'לטעינה גדולה מזו פנה לתמיכה'),
});

/**
 * POST /api/provider/balance/topup — the provider buys credit.
 *
 * The only card charge in the system, and the provider is the payer. Without a
 * configured gateway the mock adapter settles it immediately, so the whole
 * balance mechanism is exercisable end to end in development; the response says
 * plainly when that is what happened.
 */
export const POST = route(async (request: NextRequest) => {
  const { providerId, session } = await requireProvider();
  const input = await parseBody(request, topupSchema);
  const admin = requireServiceClient();

  const result = await startTopup(admin, {
    providerId,
    amount: input.amount,
    providerEmail: session.email,
    providerName: session.fullName,
  });

  const status = await getBalanceStatus(admin, providerId);

  if (result.topup.status === 'captured') {
    await notify({
      event: 'topup_completed',
      recipient: { userId: session.userId, email: session.email, phone: session.phone },
      url: '/provider/balance',
      template: { balance: formatPrice(status.balance) },
      client: admin,
    });
  }

  return jsonOk({
    topup: {
      id: result.topup.id,
      amount: Number(result.topup.amount),
      status: result.topup.status,
      gateway: result.topup.gateway,
    },
    redirectUrl: result.redirectUrl ?? null,
    mocked: result.mocked,
    gateway: getPaymentAdapter().name,
    balance: status.balance,
    state: status.state,
    canAcceptWork: status.canAcceptWork,
  });
});
