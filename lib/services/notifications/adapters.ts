import { env } from '@/lib/env';
import type {
  DeliveryResult,
  NotificationChannelAdapter,
  NotificationPayload,
  NotificationRecipient,
} from './types';

/**
 * Every adapter below shares the same shape: if it has credentials and
 * NOTIFICATIONS_MODE=live it sends, otherwise it logs a structured line and
 * reports `mocked: true` so the UI can say so honestly.
 */
function logMock(channel: string, payload: NotificationPayload): DeliveryResult {
  // The console is the development transport for every external channel.
  console.info(
    `[notify:${channel}] → ${payload.recipient.userId} | ${payload.event} | ${payload.title} — ${payload.body}`,
  );
  return { channel: channel as DeliveryResult['channel'], ok: true, mocked: true };
}

const live = () => env.notificationsMode === 'live';

export class InAppAdapter implements NotificationChannelAdapter {
  readonly channel = 'in_app' as const;
  /** Always live: in-app notifications are rows in our own database. */
  readonly isLive = true;
  canDeliverTo() {
    return true;
  }
  async send(): Promise<DeliveryResult> {
    // The row is written by NotificationService; nothing to transmit.
    return { channel: 'in_app', ok: true, mocked: false };
  }
}

export class EmailAdapter implements NotificationChannelAdapter {
  readonly channel = 'email' as const;
  get isLive() {
    return live() && Boolean(env.emailApiKey);
  }
  canDeliverTo(recipient: NotificationRecipient) {
    return Boolean(recipient.email);
  }
  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.isLive) return logMock('email', payload);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.emailApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.emailFrom,
          to: payload.recipient.email,
          subject: payload.title,
          text: `${payload.body}${payload.url ? `\n\n${payload.url}` : ''}`,
        }),
      });
      if (!response.ok) {
        return { channel: 'email', ok: false, mocked: false, error: `HTTP ${response.status}` };
      }
      return { channel: 'email', ok: true, mocked: false };
    } catch (error) {
      return {
        channel: 'email',
        ok: false,
        mocked: false,
        error: error instanceof Error ? error.message : 'email failed',
      };
    }
  }
}

export class SmsAdapter implements NotificationChannelAdapter {
  readonly channel = 'sms' as const;
  get isLive() {
    return live() && Boolean(env.smsApiKey);
  }
  canDeliverTo(recipient: NotificationRecipient) {
    return Boolean(recipient.phone);
  }
  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.isLive) return logMock('sms', payload);
    try {
      const response = await fetch('https://api.sms-provider.example/v1/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.smsApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: payload.recipient.phone,
          sender: process.env.SMS_SENDER_ID ?? 'GETSERVICE',
          text: `${payload.title}\n${payload.body}`,
        }),
      });
      if (!response.ok) {
        return { channel: 'sms', ok: false, mocked: false, error: `HTTP ${response.status}` };
      }
      return { channel: 'sms', ok: true, mocked: false };
    } catch (error) {
      return {
        channel: 'sms',
        ok: false,
        mocked: false,
        error: error instanceof Error ? error.message : 'sms failed',
      };
    }
  }
}

export class PushAdapter implements NotificationChannelAdapter {
  readonly channel = 'push' as const;
  get isLive() {
    return live() && Boolean(env.pushApiKey);
  }
  canDeliverTo() {
    // Device tokens are registered per user; the mock path covers development.
    return true;
  }
  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.isLive) return logMock('push', payload);
    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${env.pushApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: `/topics/user_${payload.recipient.userId}`,
          notification: { title: payload.title, body: payload.body },
          data: { url: payload.url ?? '/', event: payload.event },
        }),
      });
      if (!response.ok) {
        return { channel: 'push', ok: false, mocked: false, error: `HTTP ${response.status}` };
      }
      return { channel: 'push', ok: true, mocked: false };
    } catch (error) {
      return {
        channel: 'push',
        ok: false,
        mocked: false,
        error: error instanceof Error ? error.message : 'push failed',
      };
    }
  }
}

export class WhatsAppAdapter implements NotificationChannelAdapter {
  readonly channel = 'whatsapp' as const;
  get isLive() {
    return live() && Boolean(env.whatsappApiKey && process.env.WHATSAPP_PHONE_ID);
  }
  canDeliverTo(recipient: NotificationRecipient) {
    return Boolean(recipient.phone);
  }
  async send(payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.isLive) return logMock('whatsapp', payload);
    try {
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.whatsappApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: payload.recipient.phone,
            type: 'text',
            text: { body: `${payload.title}\n${payload.body}` },
          }),
        },
      );
      if (!response.ok) {
        return { channel: 'whatsapp', ok: false, mocked: false, error: `HTTP ${response.status}` };
      }
      return { channel: 'whatsapp', ok: true, mocked: false };
    } catch (error) {
      return {
        channel: 'whatsapp',
        ok: false,
        mocked: false,
        error: error instanceof Error ? error.message : 'whatsapp failed',
      };
    }
  }
}
