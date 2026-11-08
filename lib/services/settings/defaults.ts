// Type-only imports: both are erased at build time, so reading a default never
// drags the validation library into a browser bundle.
import type { z } from 'zod';
import type { SETTINGS_SCHEMAS, SettingKey } from './schema';

/** One default per setting key, in exactly the shape that key's schema parses to. */
type SettingsDefaults = { [K in SettingKey]: z.infer<(typeof SETTINGS_SCHEMAS)[K]> };

/**
 * Shipped platform defaults, mirroring
 * `supabase/migrations/…_reference_data.sql`.
 *
 * An admin can change every one of these at runtime; they are the fallback used
 * when the database has no row for a key yet, or is unreachable.
 */
export const SETTINGS_DEFAULTS: SettingsDefaults = {
  platform_fee_rules: {
    currency: 'ILS',
    default_percentage: 0.15,
    minimum_fee: 15,
    maximum_fee: 400,
    tiers: [
      { label: 'עד ₪999', min_amount: 0, max_amount: 999, percentage: 0.15 },
      { label: '₪1,000 ומעלה', min_amount: 1000, max_amount: null, percentage: 0.1 },
    ],
    category_overrides: {},
    provider_overrides: {},
  },
  match_weights: {
    distance: 0.3,
    rating: 0.2,
    availability: 0.15,
    category_match: 0.15,
    response_speed: 0.1,
    completed_jobs: 0.1,
  },
  matching: {
    radius_steps_km: [5, 10, 20],
    minimum_providers: 3,
    max_providers_per_job: 10,
    max_distance_km: 60,
    prefer_favorites: true,
    favorite_bonus: 0.05,
    verified_only: true,
  },
  timeouts: {
    job_search_minutes: 30,
    provider_response_minutes: 15,
    offer_validity_minutes: 120,
    auto_cancel_unmatched_minutes: 120,
  },
  cancellation: {
    free_window_minutes: 15,
    customer_fee_percentage: 0.05,
    provider_penalty_points: 5,
    require_reason: true,
  },
  reviews: {
    window_days: 14,
    min_comment_length: 0,
    auto_flag_below: 2,
    criteria: ['professionalism', 'price', 'punctuality', 'service'],
  },
  notifications: {
    channels: { in_app: true, push: true, sms: true, email: true, whatsapp: false },
    quiet_hours: { enabled: true, from: '22:00', to: '07:00' },
    events: {
      job_created: ['in_app'],
      new_job_for_provider: ['in_app', 'push'],
      new_offer: ['in_app', 'push'],
      offer_accepted: ['in_app', 'push', 'sms'],
      provider_on_the_way: ['in_app', 'push'],
      provider_arrived: ['in_app', 'push'],
      job_completed: ['in_app', 'push', 'email'],
      confirmation_requested: ['in_app', 'push'],
      job_confirmed: ['in_app', 'push'],
      commission_charged: ['in_app'],
      commission_refunded: ['in_app'],
      balance_low: ['in_app', 'push'],
      balance_blocked: ['in_app', 'push', 'sms'],
      topup_completed: ['in_app'],
      job_lost_no_balance: ['in_app', 'push', 'sms'],
      new_message: ['in_app', 'push'],
      new_review: ['in_app'],
    },
  },
  anti_fraud: {
    duplicate_job_window_minutes: 10,
    max_jobs_per_hour: 5,
    max_offers_per_hour: 30,
    review_burst_threshold: 5,
    flag_new_account_days: 3,
  },
  billing: {
    minimum_balance: 0,
    low_balance_threshold: 150,
    refund_on_customer_cancellation: true,
    refund_on_provider_cancellation: false,
    refund_window_hours: 48,
    topup_presets: [100, 250, 500, 1000],
  },
  verification: {
    arrival_radius_m: 300,
    require_arrival_checkin: true,
    require_completion_photo: false,
    require_customer_confirmation: true,
    auto_confirm_after_hours: 48,
    flag_price_gap_percent: 0.25,
  },
};
