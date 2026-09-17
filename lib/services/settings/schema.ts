import { z } from 'zod';

/**
 * Platform settings live in the `settings` table so an admin can change them
 * without a deploy. These schemas are the contract: anything read from the
 * database is parsed, and anything written is validated first.
 */

export const feeTierSchema = z.object({
  label: z.string().min(1),
  min_amount: z.number().min(0),
  max_amount: z.number().min(0).nullable(),
  percentage: z.number().min(0).max(0.5),
});

export const platformFeeRulesSchema = z.object({
  currency: z.string().default('ILS'),
  default_percentage: z.number().min(0).max(0.5).default(0.15),
  minimum_fee: z.number().min(0).default(0),
  maximum_fee: z.number().min(0).nullable().default(null),
  tiers: z.array(feeTierSchema).default([]),
  /** Keyed by category slug. */
  category_overrides: z.record(z.string(), z.number().min(0).max(0.5)).default({}),
  /** Keyed by provider id. A provider can never set this — admin only. */
  provider_overrides: z.record(z.string(), z.number().min(0).max(0.5)).default({}),
});

export const matchWeightsSchema = z.object({
  distance: z.number().min(0).max(1),
  rating: z.number().min(0).max(1),
  availability: z.number().min(0).max(1),
  category_match: z.number().min(0).max(1),
  response_speed: z.number().min(0).max(1),
  completed_jobs: z.number().min(0).max(1),
});

export const matchingSettingsSchema = z.object({
  radius_steps_km: z.array(z.number().positive()).min(1).default([5, 10, 20]),
  minimum_providers: z.number().int().min(1).default(3),
  max_providers_per_job: z.number().int().min(1).max(50).default(10),
  max_distance_km: z.number().positive().default(60),
  prefer_favorites: z.boolean().default(true),
  favorite_bonus: z.number().min(0).max(0.5).default(0.05),
  verified_only: z.boolean().default(true),
});

export const timeoutSettingsSchema = z.object({
  job_search_minutes: z.number().int().positive().default(30),
  provider_response_minutes: z.number().int().positive().default(15),
  offer_validity_minutes: z.number().int().positive().default(120),
  auto_cancel_unmatched_minutes: z.number().int().positive().default(120),
});

export const cancellationSettingsSchema = z.object({
  free_window_minutes: z.number().int().min(0).default(15),
  customer_fee_percentage: z.number().min(0).max(0.5).default(0.05),
  provider_penalty_points: z.number().int().min(0).default(5),
  require_reason: z.boolean().default(true),
});

export const reviewSettingsSchema = z.object({
  window_days: z.number().int().positive().default(14),
  min_comment_length: z.number().int().min(0).default(0),
  auto_flag_below: z.number().min(1).max(5).default(2),
  criteria: z
    .array(z.enum(['professionalism', 'price', 'punctuality', 'service']))
    .default(['professionalism', 'price', 'punctuality', 'service']),
});

export const notificationSettingsSchema = z.object({
  channels: z.record(z.string(), z.boolean()).default({}),
  quiet_hours: z
    .object({ enabled: z.boolean(), from: z.string(), to: z.string() })
    .default({ enabled: false, from: '22:00', to: '07:00' }),
  events: z.record(z.string(), z.array(z.string())).default({}),
});

export const antiFraudSettingsSchema = z.object({
  duplicate_job_window_minutes: z.number().int().min(0).default(10),
  max_jobs_per_hour: z.number().int().positive().default(5),
  max_offers_per_hour: z.number().int().positive().default(30),
  review_burst_threshold: z.number().int().positive().default(5),
  flag_new_account_days: z.number().int().min(0).default(3),
});

export type PlatformFeeRules = z.infer<typeof platformFeeRulesSchema>;
export type MatchWeights = z.infer<typeof matchWeightsSchema>;
export type MatchingSettings = z.infer<typeof matchingSettingsSchema>;
export type TimeoutSettings = z.infer<typeof timeoutSettingsSchema>;
export type CancellationSettings = z.infer<typeof cancellationSettingsSchema>;
export type ReviewSettings = z.infer<typeof reviewSettingsSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type AntiFraudSettings = z.infer<typeof antiFraudSettingsSchema>;

export const SETTINGS_SCHEMAS = {
  platform_fee_rules: platformFeeRulesSchema,
  match_weights: matchWeightsSchema,
  matching: matchingSettingsSchema,
  timeouts: timeoutSettingsSchema,
  cancellation: cancellationSettingsSchema,
  reviews: reviewSettingsSchema,
  notifications: notificationSettingsSchema,
  anti_fraud: antiFraudSettingsSchema,
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMAS;

/** Defaults mirror `supabase/migrations/…_reference_data.sql`. */
export const SETTINGS_DEFAULTS: { [K in SettingKey]: z.infer<(typeof SETTINGS_SCHEMAS)[K]> } = {
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
      payment_completed: ['in_app', 'email'],
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
};
