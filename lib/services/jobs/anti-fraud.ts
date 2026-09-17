import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { AntiFraudSettings } from '@/lib/services/settings/schema';

export interface FraudSignal {
  code: 'duplicate_job' | 'review_burst' | 'new_account' | 'price_mismatch';
  message: string;
}

/**
 * Cheap, server-side abuse checks. Deliberately conservative: they surface a
 * signal rather than blocking, except for exact duplicates, which are almost
 * always a double-submit.
 */
export async function detectDuplicateJob(
  supabase: SupabaseClient<Database>,
  customerId: string,
  categoryId: string,
  description: string,
  settings: AntiFraudSettings,
): Promise<FraudSignal | null> {
  if (settings.duplicate_job_window_minutes <= 0) return null;

  const since = new Date(
    Date.now() - settings.duplicate_job_window_minutes * 60_000,
  ).toISOString();

  const { data } = await supabase
    .from('jobs')
    .select('id, description')
    .eq('customer_id', customerId)
    .eq('category_id', categoryId)
    .gte('created_at', since)
    .in('status', ['requested', 'searching', 'offers_received'])
    .limit(5);

  const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
  const target = normalise(description);

  const duplicate = (data ?? []).find((job) => normalise(job.description) === target);
  if (!duplicate) return null;

  return {
    code: 'duplicate_job',
    message: 'כבר קיימת בקשה זהה שנפתחה לאחרונה. בדוק את העבודות הפעילות שלך.',
  };
}

/**
 * The customer may only be charged the price the provider actually offered.
 * Verified server-side so a tampered client cannot lower the amount.
 */
export function verifyAgreedPrice(offerPrice: number, requestedPrice: number | null): boolean {
  if (requestedPrice === null || requestedPrice === undefined) return true;
  return Math.abs(offerPrice - requestedPrice) < 0.01;
}

/** Several reviews from one customer for one provider in a short window. */
export async function detectReviewBurst(
  supabase: SupabaseClient<Database>,
  customerId: string,
  providerId: string,
  settings: AntiFraudSettings,
): Promise<FraudSignal | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('provider_id', providerId)
    .gte('created_at', since);

  if ((count ?? 0) < settings.review_burst_threshold) return null;
  return {
    code: 'review_burst',
    message: 'זוהתה פעילות דירוג חריגה. הביקורת סומנה לבדיקה.',
  };
}

/** Accounts created very recently get flagged, not blocked. */
export function isNewAccount(createdAt: string, settings: AntiFraudSettings): boolean {
  const age = Date.now() - new Date(createdAt).getTime();
  return age < settings.flag_new_account_days * 24 * 60 * 60 * 1000;
}
