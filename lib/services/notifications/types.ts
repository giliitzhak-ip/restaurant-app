import type { NotificationChannel } from '@/types/database';

export type NotificationEvent =
  | 'job_created'
  | 'new_job_for_provider'
  | 'new_offer'
  | 'offer_accepted'
  | 'provider_on_the_way'
  | 'provider_arrived'
  | 'job_completed'
  | 'payment_completed'
  | 'new_message'
  | 'new_review'
  | 'provider_verified'
  | 'provider_rejected'
  | 'job_cancelled'
  | 'dispute_opened';

export interface NotificationRecipient {
  userId: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  locale?: string;
}

export interface NotificationPayload {
  event: NotificationEvent;
  recipient: NotificationRecipient;
  title: string;
  body: string;
  jobId?: string | null;
  /** Deep link the notification should open. */
  url?: string;
  data?: Record<string, string | number | null>;
}

export interface DeliveryResult {
  channel: NotificationChannel;
  ok: boolean;
  error?: string;
  /** True when the adapter only logged the message instead of sending it. */
  mocked: boolean;
}

/** One transport. Adding WhatsApp or a push vendor means adding one of these. */
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  readonly isLive: boolean;
  /** False when the recipient lacks the address this channel needs. */
  canDeliverTo(recipient: NotificationRecipient): boolean;
  send(payload: NotificationPayload): Promise<DeliveryResult>;
}
