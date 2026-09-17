import { beforeEach, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '@/domains/payments/mock-provider';
import { shekelsToAgorot } from '@/domains/payments/fees';

describe('payment adapter (spec §27)', () => {
  let provider: MockPaymentProvider;

  beforeEach(() => {
    provider = new MockPaymentProvider();
  });

  const authRequest = {
    idempotencyKey: 'auth-1',
    amount: shekelsToAgorot(290),
    currency: 'ILS',
    jobId: 'job-0001-aaaa',
    customerId: 'cust-1',
  };

  it('declares itself as not real, so the UI cannot claim otherwise', () => {
    expect(provider.isReal).toBe(false);
  });

  it('authorizes and then captures', async () => {
    const auth = await provider.authorize(authRequest);
    expect(auth.ok).toBe(true);
    expect(auth.externalRef).not.toBeNull();

    const capture = await provider.capture({
      idempotencyKey: 'cap-1',
      externalRef: auth.externalRef!,
      amount: authRequest.amount,
    });
    expect(capture.ok).toBe(true);
  });

  it('is idempotent: a retried authorize does not create a second charge', async () => {
    const first = await provider.authorize(authRequest);
    const retry = await provider.authorize(authRequest);
    expect(retry).toEqual(first);
  });

  it('is idempotent for capture, refund and payout', async () => {
    const auth = await provider.authorize(authRequest);
    const ref = auth.externalRef!;

    const cap1 = await provider.capture({ idempotencyKey: 'cap-x', externalRef: ref, amount: 10_000 });
    const cap2 = await provider.capture({ idempotencyKey: 'cap-x', externalRef: ref, amount: 10_000 });
    expect(cap2).toEqual(cap1);

    const r1 = await provider.refund({ idempotencyKey: 'ref-x', externalRef: ref, amount: 5_000 });
    const r2 = await provider.refund({ idempotencyKey: 'ref-x', externalRef: ref, amount: 5_000 });
    expect(r2).toEqual(r1);

    const p1 = await provider.createProviderPayout({
      idempotencyKey: 'pay-x', providerId: 'prov-1', amount: 5_000, currency: 'ILS', jobId: 'job-1',
    });
    const p2 = await provider.createProviderPayout({
      idempotencyKey: 'pay-x', providerId: 'prov-1', amount: 5_000, currency: 'ILS', jobId: 'job-1',
    });
    expect(p2).toEqual(p1);
  });

  it('refuses to capture more than was authorized', async () => {
    const auth = await provider.authorize(authRequest);
    const capture = await provider.capture({
      idempotencyKey: 'cap-over',
      externalRef: auth.externalRef!,
      amount: authRequest.amount + 1,
    });
    expect(capture.ok).toBe(false);
    expect(capture.errorCode).toBe('CAPTURE_EXCEEDS_AUTHORIZATION');
  });

  it('refuses to refund more than was captured', async () => {
    const auth = await provider.authorize(authRequest);
    await provider.capture({
      idempotencyKey: 'cap-r', externalRef: auth.externalRef!, amount: shekelsToAgorot(100),
    });
    const refund = await provider.refund({
      idempotencyKey: 'ref-over',
      externalRef: auth.externalRef!,
      amount: shekelsToAgorot(200),
    });
    expect(refund.ok).toBe(false);
    expect(refund.errorCode).toBe('REFUND_EXCEEDS_CAPTURE');
  });

  it('supports a partial capture when the final price came in lower', async () => {
    const auth = await provider.authorize(authRequest);
    const capture = await provider.capture({
      idempotencyKey: 'cap-partial',
      externalRef: auth.externalRef!,
      amount: shekelsToAgorot(250),
    });
    expect(capture.ok).toBe(true);
  });

  it('reports a declined card as a failure, never as success', async () => {
    provider.failingJobIds.add(authRequest.jobId);
    const auth = await provider.authorize(authRequest);
    expect(auth.ok).toBe(false);
    expect(auth.status).toBe('failed');
    expect(auth.errorCode).toBe('CARD_DECLINED');
  });

  it('rejects non-positive amounts', async () => {
    const auth = await provider.authorize({ ...authRequest, amount: 0 });
    expect(auth.ok).toBe(false);
    expect(auth.errorCode).toBe('INVALID_AMOUNT');
  });

  it('rejects capture against an unknown authorization', async () => {
    const capture = await provider.capture({
      idempotencyKey: 'cap-unknown', externalRef: 'nope', amount: 100,
    });
    expect(capture.ok).toBe(false);
    expect(capture.errorCode).toBe('UNKNOWN_AUTHORIZATION');
  });
});
