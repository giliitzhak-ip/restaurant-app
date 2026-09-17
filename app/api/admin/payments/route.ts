import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { adminListSchema } from '@/lib/validation/admin';

/**
 * GET /api/admin/payments — the ledger.
 *
 * Returns our own records only: amounts, the fee split and the provider's
 * transaction id. No card data ever reaches our database, so none can leak here.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAdmin();
  const admin = requireServiceClient();
  const { status, page, pageSize } = parseQuery(request, adminListSchema);

  let query = admin
    .from('payments')
    .select(
      `id, amount, platform_fee, provider_payout, currency, status, provider_name,
       external_id, authorized_at, captured_at, refunded_at, created_at,
       job:jobs (id, reference, title),
       provider:provider_profiles (id, business_name)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status as never);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw ApiError.badRequest('לא ניתן לטעון עסקאות', error.message);

  const totals = (data ?? []).reduce(
    (acc, row) => ({
      gross: acc.gross + Number(row.amount),
      fees: acc.fees + Number(row.platform_fee),
      payouts: acc.payouts + Number(row.provider_payout),
    }),
    { gross: 0, fees: 0, payouts: 0 },
  );

  return jsonOk({ payments: data ?? [], totals, total: count ?? 0, page, pageSize });
});
