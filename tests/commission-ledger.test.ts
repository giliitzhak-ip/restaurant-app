import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  adjustBalance,
  chargeCommission,
  getBalanceStatus,
  refundCommission,
} from '@/lib/services/billing/ledger';
import { startTopup } from '@/lib/services/billing/topup';
import { MockPaymentAdapter, setPaymentAdapter } from '@/lib/services/payments';
import { asClient, balanceEntryTrigger, FakeSupabase } from './helpers/fake-supabase';

const PROVIDER_ID = 'provider-1';
const JOB_ID = 'job-1';
const ADMIN_ID = 'admin-1';

/**
 * The ledger against a stand-in database, with the balance trigger emulated.
 *
 * What the trigger does is load-bearing — it is what makes the floor race-free
 * and the balance derived rather than written — so these tests go through it
 * rather than around it. The real trigger is checked by
 * `supabase/tests/rls-verification.sql` against PostgreSQL.
 */
function client(balance: number, minimumBalance = 0) {
  const fake = new FakeSupabase(
    {
      provider_profiles: [{ id: PROVIDER_ID, business_name: 'אבי אינסטלציה', balance }],
      balance_entries: [],
      provider_topups: [],
      jobs: [
        {
          id: JOB_ID,
          reference: 'GS-ABC123',
          assigned_provider_id: PROVIDER_ID,
          status: 'provider_selected',
        },
      ],
    },
    {},
    { balance_entries: balanceEntryTrigger(minimumBalance) },
  );
  return { fake, db: asClient<SupabaseClient<Database>>(fake) };
}

const jobForRefund = (overrides: Record<string, unknown> = {}) => ({
  id: JOB_ID,
  reference: 'GS-ABC123',
  assigned_provider_id: PROVIDER_ID,
  commission_amount: 100,
  commission_charged_at: new Date().toISOString(),
  commission_refunded_at: null,
  ...overrides,
}) as Parameters<typeof refundCommission>[1]['job'];

describe('chargeCommission', () => {
  it('takes the commission from the balance and stamps the job', async () => {
    const { fake, db } = client(500);

    const charge = await chargeCommission(db, {
      jobId: JOB_ID,
      providerId: PROVIDER_ID,
      amount: 1000,
      jobReference: 'GS-ABC123',
    });

    // 10% tier for ₪1,000 and over, per the shipped fee rules.
    expect(charge.breakdown.platformFee).toBe(100);
    expect(charge.balanceAfter).toBe(400);
    expect(fake.table('provider_profiles')[0].balance).toBe(400);

    const entry = fake.table('balance_entries')[0];
    expect(entry.type).toBe('commission');
    expect(entry.amount).toBe(-100);
    expect(entry.job_id).toBe(JOB_ID);

    const job = fake.table('jobs')[0];
    expect(job.commission_amount).toBe(100);
    expect(job.commission_charged_at).toBe(entry.created_at);
    // The provider keeps the rest, and collects all of it from the customer.
    expect(job.provider_payout).toBe(900);
  });

  it('refuses the job when the balance cannot cover the commission', async () => {
    const { fake, db } = client(40);

    await expect(
      chargeCommission(db, { jobId: JOB_ID, providerId: PROVIDER_ID, amount: 1000 }),
    ).rejects.toMatchObject({ code: 'insufficient_balance' });

    // Nothing was written, so the provider is not left mid-charge.
    expect(fake.table('balance_entries')).toHaveLength(0);
    expect(fake.table('provider_profiles')[0].balance).toBe(40);
  });

  it('never charges the same job twice', async () => {
    const { fake, db } = client(500);

    const first = await chargeCommission(db, {
      jobId: JOB_ID,
      providerId: PROVIDER_ID,
      amount: 1000,
    });
    const second = await chargeCommission(db, {
      jobId: JOB_ID,
      providerId: PROVIDER_ID,
      amount: 1000,
    });

    expect(second.entry.id).toBe(first.entry.id);
    expect(fake.table('balance_entries')).toHaveLength(1);
    expect(fake.table('provider_profiles')[0].balance).toBe(400);
  });

  it('is stopped by the floor even if the pre-check is bypassed', async () => {
    // The floor lives in the trigger precisely so that a path which skips the
    // application check still cannot hand out work on credit.
    const { fake, db } = client(50, 0);

    const { error } = await db.from('balance_entries').insert({
      provider_id: PROVIDER_ID,
      type: 'commission',
      amount: -100,
      balance_after: 0,
      job_id: JOB_ID,
    });

    expect(error?.message).toContain('insufficient balance');
    expect(fake.table('provider_profiles')[0].balance).toBe(50);
  });
});

describe('refundCommission', () => {
  it('returns the commission when the customer cancelled', async () => {
    const { fake, db } = client(500);
    await chargeCommission(db, { jobId: JOB_ID, providerId: PROVIDER_ID, amount: 1000 });

    const refund = await refundCommission(db, {
      job: jobForRefund(),
      cancelledBy: 'customer',
      reasonNote: 'נמצא פתרון אחר',
    });

    expect(refund.decision.refund).toBe(true);
    expect(refund.entry?.type).toBe('commission_refund');
    expect(fake.table('provider_profiles')[0].balance).toBe(500);
    expect(fake.table('jobs')[0].commission_refunded_at).toBe(refund.entry?.created_at);
  });

  it('keeps the commission when the provider cancelled', async () => {
    const { fake, db } = client(500);
    await chargeCommission(db, { jobId: JOB_ID, providerId: PROVIDER_ID, amount: 1000 });

    const refund = await refundCommission(db, {
      job: jobForRefund(),
      cancelledBy: 'provider',
      reasonNote: 'לא הסתדר לי',
    });

    expect(refund.decision.refund).toBe(false);
    expect(refund.entry).toBeNull();
    expect(fake.table('provider_profiles')[0].balance).toBe(400);
  });

  it('is a no-op for a job that was never charged', async () => {
    const { fake, db } = client(500);

    const refund = await refundCommission(db, {
      job: jobForRefund({ commission_charged_at: null, commission_amount: null }),
      cancelledBy: 'customer',
    });

    expect(refund.decision.refund).toBe(false);
    expect(fake.table('balance_entries')).toHaveLength(0);
  });

  it('does not refund a job that was already refunded', async () => {
    const { db } = client(500);
    await chargeCommission(db, { jobId: JOB_ID, providerId: PROVIDER_ID, amount: 1000 });

    const refund = await refundCommission(db, {
      job: jobForRefund({ commission_refunded_at: new Date().toISOString() }),
      cancelledBy: 'customer',
    });

    expect(refund.decision.code).toBe('already_refunded');
    expect(refund.entry).toBeNull();
  });
});

describe('adjustBalance', () => {
  it('records who made the correction', async () => {
    const { fake, db } = client(100);

    const entry = await adjustBalance(db, {
      providerId: PROVIDER_ID,
      amount: -25,
      reason: 'תיאום לאחר בדיקת תלונה',
      adminUserId: ADMIN_ID,
    });

    expect(entry.created_by).toBe(ADMIN_ID);
    expect(fake.table('provider_profiles')[0].balance).toBe(75);
  });

  it('rejects a zero adjustment', async () => {
    const { db } = client(100);

    await expect(
      adjustBalance(db, {
        providerId: PROVIDER_ID,
        amount: 0,
        reason: 'כלום',
        adminUserId: ADMIN_ID,
      }),
    ).rejects.toMatchObject({ code: 'invalid_amount' });
  });
});

describe('topping up', () => {
  beforeEach(() => {
    setPaymentAdapter(new MockPaymentAdapter());
  });

  it('credits the balance once the charge settles', async () => {
    const { fake, db } = client(0);

    const result = await startTopup(db, { providerId: PROVIDER_ID, amount: 250 });

    expect(result.topup.status).toBe('captured');
    expect(result.mocked).toBe(true);
    expect(fake.table('provider_profiles')[0].balance).toBe(250);

    const entry = fake.table('balance_entries')[0];
    expect(entry.type).toBe('topup');
    expect(entry.amount).toBe(250);
  });

  it('turns a blocked provider back into one who can accept work', async () => {
    const { db } = client(0);

    expect((await getBalanceStatus(db, PROVIDER_ID, 100)).canAcceptWork).toBe(false);
    await startTopup(db, { providerId: PROVIDER_ID, amount: 250 });
    expect((await getBalanceStatus(db, PROVIDER_ID, 100)).canAcceptWork).toBe(true);
  });

  it('rejects a non-positive amount before touching the gateway', async () => {
    const { fake, db } = client(0);

    await expect(startTopup(db, { providerId: PROVIDER_ID, amount: 0 })).rejects.toMatchObject({
      code: 'bad_request',
    });
    expect(fake.table('provider_topups')).toHaveLength(0);
  });
});
