import { route } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { requireProvider, requireServiceClient } from '@/lib/api/guards';
import { getBalanceStatus, listEntries } from '@/lib/services/billing/ledger';
import { suggestedTopup } from '@/lib/services/billing';
import { getSetting } from '@/lib/services/settings';

/**
 * GET /api/provider/balance — the provider's credit, ledger and what it means.
 *
 * Only ever the caller's own: `requireProvider` resolves the provider id from
 * the session, never from the request, so there is no id to tamper with.
 */
export const GET = route(async () => {
  const { providerId } = await requireProvider();
  const admin = requireServiceClient();

  const [status, entries, billing] = await Promise.all([
    getBalanceStatus(admin, providerId),
    listEntries(admin, providerId, 50),
    getSetting('billing'),
  ]);

  return jsonOk({
    balance: status.balance,
    state: status.state,
    canAcceptWork: status.canAcceptWork,
    shortfall: status.shortfall,
    lowBalanceThreshold: status.lowBalanceThreshold,
    minimumBalance: status.minimumBalance,
    presets: billing.topup_presets,
    suggestedTopup: status.shortfall > 0 ? suggestedTopup(status.shortfall, billing) : null,
    entries: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: Number(entry.amount),
      balanceAfter: Number(entry.balance_after),
      jobId: entry.job_id,
      description: entry.description,
      createdAt: entry.created_at,
    })),
    policy: {
      refundOnCustomerCancellation: billing.refund_on_customer_cancellation,
      refundOnProviderCancellation: billing.refund_on_provider_cancellation,
      refundWindowHours: billing.refund_window_hours,
    },
  });
});
