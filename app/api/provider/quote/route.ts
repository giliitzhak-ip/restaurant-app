import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { requireProvider } from '@/lib/api/guards';
import { getSetting } from '@/lib/services/settings';
import { calculateFee, providerPriceBreakdown } from '@/lib/services/fees';

/**
 * GET /api/provider/quote?amount=…
 *
 * Price transparency for the provider: gross, GET SERVICE commission, net.
 * Computed from the same rules the payment flow uses, so the preview and the
 * eventual payout cannot drift apart.
 */
export const GET = route(async (request: NextRequest) => {
  const { providerId } = await requireProvider();
  const { amount } = parseQuery(
    request,
    z.object({ amount: z.coerce.number().positive().max(1_000_000) }),
  );

  const rules = await getSetting('platform_fee_rules');
  const breakdown = providerPriceBreakdown(calculateFee(amount, rules, { providerId }));

  return jsonOk(breakdown);
});
