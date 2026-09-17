import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  drainOutbox,
  getNotifier,
  queueDelivery,
  redactDestination,
  setNotifier,
  type DeliveryRequest,
  type DeliveryResult,
  type Notifier,
} from '@/domains/notifications';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, withSystem } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createCustomer,
  createProvider,
  createJob,
} from '../helpers/fixtures';

const LOC = { lat: 32.0742, lon: 34.7749 };

/** A notifier we can steer, so the outbox's behaviour is the thing under test. */
class ScriptedNotifier implements Notifier {
  readonly name = 'scripted';
  readonly isReal = false;
  readonly channels = ['push', 'sms'] as const;
  sent: DeliveryRequest[] = [];
  constructor(private readonly reply: (r: DeliveryRequest) => DeliveryResult) {}
  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    this.sent.push(request);
    return this.reply(request);
  }
}

/**
 * Notification delivery (migration 0035).
 *
 * `notifications` rows reached an open browser over SSE and nothing else. For
 * a product whose premise is that a provider hears about a job within
 * seconds, a provider with the tab closed heard nothing and the offer expired
 * unseen.
 */
describe('notification delivery', () => {
  beforeEach(async () => {
    await cleanupTestData();
    setNotifier(null);
  });

  afterAll(async () => {
    setNotifier(null);
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  /**
   * The fixtures create accounts with no phone number, and `queueDelivery`
   * refuses to queue SMS to a destination that does not exist — so a test
   * about SMS has to give the provider a number. Worth noticing rather than
   * papering over: a provider with no phone gets no text, which is an
   * argument for requiring a verified number before verification, not for
   * queueing messages into the void.
   */
  const withPhone = async (userId: string, phone = '+972501234567') => {
    await adminPool().query('update profiles set phone = $2 where id = $1', [userId, phone]);
    return userId;
  };

  const deliveriesFor = async (userId: string) => {
    const { rows } = await adminPool().query<{
      channel: string; status: string; attempts: number; destination: string | null;
      adapter: string | null; last_error: string | null;
    }>(
      `select channel::text as channel, status::text as status, attempts, destination,
              adapter, last_error
         from notification_deliveries where user_id = $1 order by channel`,
      [userId],
    );
    return rows;
  };

  it('a dispatched offer queues a delivery for a provider who is not looking', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'מקבל', lat: 32.075, lon: 34.775 });
    await withPhone(provider.id);
    const jobId = await createJob({ customerId: customer.id, ...LOC });

    await runDispatchWave(jobId);

    const queued = await deliveriesFor(provider.id);
    // push addresses the account; sms needs a number, and the fixture has one.
    expect(queued.map((r) => r.channel)).toEqual(['push', 'sms']);
    expect(queued.every((r) => r.status === 'PENDING')).toBe(true);
    // The destination is recorded now, not looked up at send time: a provider
    // who changes their number later must not make the history claim we
    // texted the new one.
    expect(queued.find((r) => r.channel === 'sms')?.destination).toMatch(/^\+?\d/);
  });

  it('draining sends each one once and records the adapter', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'מקבל', lat: 32.075, lon: 34.775 });
    await withPhone(provider.id);
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    const notifier = new ScriptedNotifier(() => ({ ok: true, externalRef: 'x1' }));
    setNotifier(notifier);

    const first = await drainOutbox();
    expect(first.attempted).toBe(2);
    expect(first.sent).toBe(2);
    expect(notifier.sent).toHaveLength(2);

    // Nothing is due any more, so a second tick sends nothing. A delivery
    // sent twice is worse than one sent late.
    const second = await drainOutbox();
    expect(second.attempted).toBe(0);
    expect(notifier.sent).toHaveLength(2);

    const settled = await deliveriesFor(provider.id);
    expect(settled.every((r) => r.status === 'SENT')).toBe(true);
    expect(settled.every((r) => r.adapter === 'scripted')).toBe(true);
  });

  it('a retryable failure waits and stays pending, and is not lost', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'מקבל', lat: 32.075, lon: 34.775 });
    await withPhone(provider.id);
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    setNotifier(new ScriptedNotifier(() => ({ ok: false, errorCode: 'GATEWAY_TIMEOUT', retryable: true })));
    const drained = await drainOutbox();
    expect(drained.failed).toBe(2);
    expect(drained.abandoned).toBe(0);

    const pending = await deliveriesFor(provider.id);
    expect(pending.every((r) => r.status === 'PENDING')).toBe(true);
    expect(pending.every((r) => r.attempts === 1)).toBe(true);
    expect(pending.every((r) => r.last_error === 'GATEWAY_TIMEOUT')).toBe(true);

    // Backed off: the next tick does not pick it straight back up.
    const immediately = await drainOutbox();
    expect(immediately.attempted).toBe(0);
  });

  it('a failure retrying could never fix is abandoned at once', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'מקבל', lat: 32.075, lon: 34.775 });
    await withPhone(provider.id);
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    setNotifier(new ScriptedNotifier(() => ({
      ok: false, errorCode: 'INVALID_NUMBER', retryable: false,
    })));
    const drained = await drainOutbox();
    expect(drained.abandoned).toBe(2);

    const settled = await deliveriesFor(provider.id);
    expect(settled.every((r) => r.status === 'ABANDONED')).toBe(true);
  });

  it('an adapter that throws is treated as a retryable failure, not a crash', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'מקבל', lat: 32.075, lon: 34.775 });
    await withPhone(provider.id);
    const jobId = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(jobId);

    setNotifier(new ScriptedNotifier(() => {
      throw new Error('socket hang up');
    }));
    // The tick must survive a gateway behaving badly.
    const drained = await drainOutbox();
    expect(drained.failed).toBe(2);
    const rows = await deliveriesFor(provider.id);
    expect(rows.every((r) => r.last_error === 'ADAPTER_THREW')).toBe(true);
  });

  it('a channel the adapter cannot speak is abandoned rather than retried forever', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'מקבל', lat: 32.075, lon: 34.775 });

    const notification = await withSystem(async (db) => {
      const row = await db.one<{ id: string }>(
        `insert into notifications (user_id, kind, title, body)
         values ($1,'test','נושא','גוף') returning id`,
        [provider.id],
      );
      await queueDelivery(db, {
        notificationId: row!.id, userId: provider.id, channels: ['email'],
      });
      return row!.id;
    });
    expect(notification).toBeTruthy();

    // The scripted adapter speaks push and sms only.
    setNotifier(new ScriptedNotifier(() => ({ ok: true })));
    const drained = await drainOutbox();
    expect(drained.abandoned).toBe(1);
    const rows = await deliveriesFor(provider.id);
    expect(rows[0]!.last_error).toBe('CHANNEL_UNSUPPORTED');
  });

  it('nothing is queued to a destination that does not exist', async () => {
    const customer = await createCustomer();
    // A customer fixture with no phone: an outbox full of deliveries that can
    // never succeed is an outbox nobody reads.
    await adminPool().query('update profiles set phone = null where id = $1', [customer.id]);

    await withSystem(async (db) => {
      const row = await db.one<{ id: string }>(
        `insert into notifications (user_id, kind, title, body)
         values ($1,'test','נושא','גוף') returning id`,
        [customer.id],
      );
      const queued = await queueDelivery(db, {
        notificationId: row!.id, userId: customer.id, channels: ['sms'],
      });
      expect(queued).toBe(0);
    });

    expect(await deliveriesFor(customer.id)).toHaveLength(0);
  });

  it('the default adapter admits it reaches nobody', () => {
    // The dangerous version of a stand-in is the one that reports success and
    // is indistinguishable from a working gateway.
    expect(getNotifier().isReal).toBe(false);
  });

  it('a destination is logged as a shape, not as a value', () => {
    expect(redactDestination('+972501234567')).toBe('+9725********');
    expect(redactDestination('provider@example.com')).toBe('p***@example.com');
    expect(redactDestination('1234')).toBe('****');
  });
});
