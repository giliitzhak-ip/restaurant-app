import type { DbSession } from '@/lib/db';
import { withSystem } from '@/lib/db';
import { logOperation } from '@/lib/logger';
import { getNotifier } from './index';
import type { DeliveryChannel } from './notifier';

/**
 * The outbox: what the platform still owes somebody.
 *
 * A notification that matters is queued here rather than sent inline, for two
 * reasons. A send that fails inline is lost, and the request that triggered
 * it — a customer creating a job, an admin approving a document — must not
 * fail or wait because a push gateway is slow. The tick drains it with a
 * backoff, so a delivery that cannot be made is visible in a row rather than
 * absent from history.
 */

/** Give up after this many tries; the backoff reaches roughly a day by then. */
const MAX_ATTEMPTS = 6;

/** How many to attempt per tick. Small: the tick runs every 30 seconds. */
const BATCH = 25;

export interface QueueRequest {
  notificationId: string;
  userId: string;
  channels?: readonly DeliveryChannel[];
}

/**
 * Queue a notification for delivery outside the app.
 *
 * Takes the caller's transaction so the outbox row commits with whatever
 * caused it: a queued message for a decision that rolled back is a message
 * about something that never happened.
 *
 * The destination is resolved and STORED now rather than looked up at send
 * time, because a provider who changes their number later must not make the
 * history claim we texted the new one.
 */
export async function queueDelivery(
  db: DbSession,
  request: QueueRequest,
): Promise<number> {
  const contact = await db.one<{ phone: string | null; email: string | null }>(
    'select phone, email from profiles where id = $1',
    [request.userId],
  );
  if (!contact) return 0;

  const channels = request.channels ?? ['push', 'sms'];
  let queued = 0;

  for (const channel of channels) {
    // push has no device token in this deployment, so it addresses the
    // account and the adapter decides. sms and email need a real destination,
    // and a row with nowhere to go is not queued at all — an outbox full of
    // deliveries that can never succeed is an outbox nobody reads.
    const destination =
      channel === 'sms' ? contact.phone
        : channel === 'email' ? contact.email
          : request.userId;
    if (!destination) continue;

    await db.query(
      `insert into notification_deliveries
         (notification_id, user_id, channel, destination)
       values ($1,$2,$3::delivery_channel,$4)`,
      [request.notificationId, request.userId, channel, destination],
    );
    queued += 1;
  }

  return queued;
}

export interface DrainResult {
  attempted: number;
  sent: number;
  failed: number;
  abandoned: number;
}

/**
 * Attempt every delivery whose time has come.
 *
 * Each row is claimed with SKIP LOCKED and its attempt counter is bumped
 * BEFORE the send, so two instances ticking together take different rows and
 * a send that never returns costs one delivery rather than looping for ever.
 */
export async function drainOutbox(): Promise<DrainResult> {
  const notifier = getNotifier();
  const result: DrainResult = { attempted: 0, sent: 0, failed: 0, abandoned: 0 };

  const claimed = await withSystem((db) =>
    db.many<{
      id: string; notification_id: string; user_id: string; channel: DeliveryChannel;
      destination: string | null; attempts: number;
      title: string; body: string | null; payload: Record<string, unknown>; kind: string;
    }>('select * from claim_pending_deliveries($1)', [BATCH]),
  );

  for (const row of claimed) {
    result.attempted += 1;

    // A channel this adapter does not speak is abandoned rather than retried
    // forever against something that will never handle it.
    if (!notifier.channels.includes(row.channel)) {
      await settle(row.id, 'ABANDONED', notifier.name, 'CHANNEL_UNSUPPORTED');
      result.abandoned += 1;
      continue;
    }

    let outcome;
    try {
      outcome = await notifier.send({
        channel: row.channel,
        destination: row.destination ?? row.user_id,
        title: row.title,
        body: row.body ?? '',
        payload: row.payload,
        notificationId: row.notification_id,
      });
    } catch (error) {
      outcome = {
        ok: false,
        errorCode: 'ADAPTER_THREW',
        errorMessage: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        retryable: true,
      };
    }

    if (outcome.ok) {
      await settle(row.id, 'SENT', notifier.name, null);
      result.sent += 1;
      continue;
    }

    // Out of tries, or an error that retrying could never fix.
    const giveUp = row.attempts >= MAX_ATTEMPTS || outcome.retryable === false;
    await settle(
      row.id,
      giveUp ? 'ABANDONED' : 'PENDING',
      notifier.name,
      outcome.errorCode ?? outcome.errorMessage ?? 'UNKNOWN',
    );
    if (giveUp) {
      result.abandoned += 1;
      logOperation({
        userId: row.user_id,
        operation: 'notify.abandoned',
        result: 'error',
        meta: { channel: row.channel, kind: row.kind, attempts: row.attempts },
      });
    } else {
      result.failed += 1;
    }
  }

  return result;
}

async function settle(
  id: string,
  status: 'SENT' | 'PENDING' | 'ABANDONED' | 'FAILED',
  adapter: string,
  error: string | null,
): Promise<void> {
  await withSystem((db) =>
    db.query(
      `update notification_deliveries
          set status = $2::delivery_status,
              adapter = $3,
              last_error = $4,
              sent_at = case when $2 = 'SENT' then now() else sent_at end
        where id = $1`,
      [id, status, adapter, error],
    ),
  );
}
