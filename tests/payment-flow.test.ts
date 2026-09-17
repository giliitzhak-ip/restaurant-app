import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  capturePaymentForJob,
  createPaymentForJob,
  refundPaymentForJob,
} from '@/lib/services/payments/flow';
import { MockPaymentAdapter, setPaymentAdapter } from '@/lib/services/payments';
import { asClient, FakeSupabase } from './helpers/fake-supabase';

const JOB_ID = 'job-1';
const CUSTOMER_ID = 'customer-1';
const PROVIDER_ID = 'provider-1';

function client() {
  const fake = new FakeSupabase({
    payments: [],
    payment_transactions: [],
    platform_fees: [],
  });
  return { fake, db: asClient<SupabaseClient<Database>>(fake) };
}

describe('payment flow', () => {
  beforeEach(() => {
    // A fresh adapter per test so authorisation state does not leak between them.
    setPaymentAdapter(new MockPaymentAdapter());
  });

  it('authorises funds and records the split when an offer is accepted', async () => {
    const { fake, db } = client();

    const { payment, breakdown, mocked } = await createPaymentForJob(db, {
      jobId: JOB_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      amount: 1000,
      description: 'GET SERVICE — נזילה במטבח',
    });

    expect(payment.status).toBe('authorized');
    expect(mocked).toBe(true);
    expect(breakdown.amount).toBe(1000);
    expect(breakdown.platformFee).toBe(100);
    expect(breakdown.providerPayout).toBe(900);

    // Nothing is captured yet — the money is only held. (The test double has
    // no column defaults, so an unset timestamp is undefined rather than null.)
    expect(payment.captured_at ?? null).toBeNull();
    const transactions = fake.table('payment_transactions');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe('authorization');
  });

  it('captures on completion and books the platform fee', async () => {
    const { fake, db } = client();

    await createPaymentForJob(db, {
      jobId: JOB_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      amount: 1000,
      description: 'job',
    });

    const captured = await capturePaymentForJob(db, JOB_ID);

    expect(captured?.payment.status).toBe('captured');
    expect(captured?.payment.captured_at).toBeTruthy();
    expect(captured?.breakdown.platformFee).toBe(100);
    expect(captured?.breakdown.providerPayout).toBe(900);

    const fees = fake.table('platform_fees');
    expect(fees).toHaveLength(1);
    expect(fees[0].amount).toBe(100);
    expect(fees[0].job_id).toBe(JOB_ID);

    const types = fake.table('payment_transactions').map((row) => row.type);
    expect(types).toContain('capture');
    expect(types).toContain('platform_fee');
  });

  it('recomputes the split when the final price is lower than agreed', async () => {
    const { db } = client();

    await createPaymentForJob(db, {
      jobId: JOB_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      amount: 1000,
      description: 'job',
    });

    // The provider discounted the job at the end.
    const captured = await capturePaymentForJob(db, JOB_ID, 800);

    expect(captured?.breakdown.amount).toBe(800);
    // ₪800 falls into the 15% tier.
    expect(captured?.breakdown.platformFee).toBe(120);
    expect(captured?.breakdown.providerPayout).toBe(680);
  });

  it('never captures more than was authorised', async () => {
    const { db } = client();

    await createPaymentForJob(db, {
      jobId: JOB_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      amount: 500,
      description: 'job',
    });

    const captured = await capturePaymentForJob(db, JOB_ID, 5000);
    expect(captured?.breakdown.amount).toBe(500);
  });

  it('is idempotent once captured', async () => {
    const { fake, db } = client();

    await createPaymentForJob(db, {
      jobId: JOB_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      amount: 600,
      description: 'job',
    });

    await capturePaymentForJob(db, JOB_ID);
    const second = await capturePaymentForJob(db, JOB_ID);

    expect(second?.payment.status).toBe('captured');
    // A second call must not double-book the commission.
    expect(fake.table('platform_fees')).toHaveLength(1);
  });

  it('returns null for a job that has no payment', async () => {
    const { db } = client();
    expect(await capturePaymentForJob(db, 'missing-job')).toBeNull();
  });

  it('refuses to capture a payment that was never authorised', async () => {
    const fake = new FakeSupabase({
      payments: [
        {
          id: 'pay-1',
          job_id: JOB_ID,
          customer_id: CUSTOMER_ID,
          provider_id: PROVIDER_ID,
          amount: 400,
          platform_fee: 60,
          provider_payout: 340,
          currency: 'ILS',
          status: 'failed',
          external_id: null,
        },
      ],
      payment_transactions: [],
      platform_fees: [],
    });

    await expect(
      capturePaymentForJob(asClient<SupabaseClient<Database>>(fake), JOB_ID),
    ).rejects.toThrow();
  });

  it('voids the hold when a job is cancelled before capture', async () => {
    const { db } = client();

    await createPaymentForJob(db, {
      jobId: JOB_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      amount: 700,
      description: 'job',
    });

    const refunded = await refundPaymentForJob(db, JOB_ID, 'cancelled_by_customer');
    // An authorisation that was never captured is cancelled, not refunded.
    expect(refunded?.status).toBe('cancelled');
  });

  it('refunds a captured payment', async () => {
    const { fake, db } = client();

    await createPaymentForJob(db, {
      jobId: JOB_ID,
      customerId: CUSTOMER_ID,
      providerId: PROVIDER_ID,
      amount: 700,
      description: 'job',
    });
    await capturePaymentForJob(db, JOB_ID);

    const refunded = await refundPaymentForJob(db, JOB_ID, 'dispute resolved for customer');
    expect(refunded?.status).toBe('refunded');
    expect(fake.table('payment_transactions').map((row) => row.type)).toContain('refund');
  });
});
