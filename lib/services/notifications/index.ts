import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, NotificationChannel } from '@/types/database';
import { getServiceSupabase } from '@/lib/supabase/server';
import { getSetting } from '@/lib/services/settings';
import {
  EmailAdapter,
  InAppAdapter,
  PushAdapter,
  SmsAdapter,
  WhatsAppAdapter,
} from './adapters';
import { renderTemplate, type TemplateInput } from './templates';
import type {
  DeliveryResult,
  NotificationChannelAdapter,
  NotificationEvent,
  NotificationRecipient,
} from './types';

const adapters: Record<NotificationChannel, NotificationChannelAdapter> = {
  in_app: new InAppAdapter(),
  push: new PushAdapter(),
  sms: new SmsAdapter(),
  email: new EmailAdapter(),
  whatsapp: new WhatsAppAdapter(),
};

function isWithinQuietHours(from: string, to: string, now = new Date()): boolean {
  const [fromH, fromM] = from.split(':').map(Number);
  const [toH, toM] = to.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = fromH * 60 + fromM;
  const end = toH * 60 + toM;
  // Quiet hours usually wrap midnight (22:00 → 07:00).
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export interface NotifyOptions {
  event: NotificationEvent;
  recipient: NotificationRecipient;
  jobId?: string | null;
  url?: string;
  template?: TemplateInput;
  /** Bypasses quiet hours; used for time-critical events like "provider arrived". */
  urgent?: boolean;
  client?: SupabaseClient<Database>;
}

/**
 * Fans a single domain event out to the channels an admin has enabled for it.
 *
 * The in-app row is always written (it is the notification centre and the
 * realtime feed); external channels are best-effort and never fail the caller —
 * a job must not roll back because an SMS gateway hiccuped.
 */
export async function notify(options: NotifyOptions): Promise<DeliveryResult[]> {
  const { event, recipient, jobId, url, template, urgent } = options;
  const supabase = options.client ?? getServiceSupabase();
  const settings = await getSetting('notifications');
  const { title, body } = renderTemplate(event, template);

  const configured = settings.events[event] ?? ['in_app'];
  const quiet =
    !urgent &&
    settings.quiet_hours.enabled &&
    isWithinQuietHours(settings.quiet_hours.from, settings.quiet_hours.to);

  const channels = configured.filter((channel): channel is NotificationChannel => {
    if (!(channel in adapters)) return false;
    if (settings.channels[channel] === false) return false;
    // During quiet hours only the silent in-app row is written.
    if (quiet && channel !== 'in_app') return false;
    return adapters[channel as NotificationChannel].canDeliverTo(recipient);
  });

  const unique = Array.from(new Set<NotificationChannel>(['in_app', ...channels]));
  const results: DeliveryResult[] = [];

  for (const channel of unique) {
    const adapter = adapters[channel];
    let result: DeliveryResult;
    try {
      result = await adapter.send({
        event,
        recipient,
        title,
        body,
        jobId,
        url,
      });
    } catch (error) {
      result = {
        channel,
        ok: false,
        mocked: false,
        error: error instanceof Error ? error.message : 'delivery failed',
      };
    }
    results.push(result);

    if (supabase) {
      await supabase.from('notifications').insert({
        user_id: recipient.userId,
        event,
        title,
        body,
        channel,
        status: result.ok ? 'sent' : 'failed',
        job_id: jobId ?? null,
        payload: { url: url ?? null, mocked: result.mocked } as never,
        error: result.error ?? null,
        sent_at: result.ok ? new Date().toISOString() : null,
      });
    }
  }

  return results;
}

/** Sends the same event to several recipients — e.g. a job broadcast. */
export async function notifyMany(
  recipients: NotificationRecipient[],
  options: Omit<NotifyOptions, 'recipient'>,
): Promise<void> {
  await Promise.all(
    recipients.map((recipient) =>
      notify({ ...options, recipient }).catch(() => {
        /* delivery failures must never block the caller */
      }),
    ),
  );
}

export { isWithinQuietHours };
export * from './types';
export { renderTemplate } from './templates';
