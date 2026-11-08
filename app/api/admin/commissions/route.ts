import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { requireAdmin, requireServiceClient } from '@/lib/api/guards';

const listSchema = z.object({
  type: z.enum(['topup', 'commission', 'commission_refund', 'adjustment']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/admin/commissions — the balance ledger.
 *
 * This is the whole of GET SERVICE's money: commissions taken from provider
 * credit, refunds given back, and the top-ups that bought the credit. A job's
 * own payment is not here because it never happens here — the customer pays
 * the provider directly.
 *
 * No card data ever reaches our database, so none can leak through this.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAdmin();
  const admin = requireServiceClient();
  const { type, page, pageSize } = parseQuery(request, listSchema);

  let query = admin
    .from('balance_entries')
    .select(
      `id, type, amount, balance_after, description, external_id, created_at,
       job:jobs (id, reference, title, status, customer_confirmed_at, arrival_verified_at),
       provider:provider_profiles (id, business_name)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (type) query = query.eq('type', type);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw ApiError.badRequest('לא ניתן לטעון את ספר העמלות', error.message);

  // Totals are computed over the whole ledger, not the page, so the headline
  // numbers do not change as an admin pages through the rows.
  const { data: all } = await admin.from('balance_entries').select('type, amount');
  const totals = (all ?? []).reduce(
    (acc, row) => {
      const amount = Number(row.amount);
      if (row.type === 'commission') acc.commissions += Math.abs(amount);
      else if (row.type === 'commission_refund') acc.refunds += amount;
      else if (row.type === 'topup') acc.topups += amount;
      else acc.adjustments += amount;
      return acc;
    },
    { commissions: 0, refunds: 0, topups: 0, adjustments: 0 },
  );

  const { data: credit } = await admin.from('provider_profiles').select('balance');
  const outstandingCredit = (credit ?? []).reduce((sum, row) => sum + Number(row.balance), 0);

  return jsonOk({
    entries: data ?? [],
    totals: {
      ...totals,
      net: Math.round((totals.commissions - totals.refunds) * 100) / 100,
      /** Credit providers have bought and not yet spent — a liability, not revenue. */
      outstandingCredit: Math.round(outstandingCredit * 100) / 100,
    },
    total: count ?? 0,
    page,
    pageSize,
  });
});
