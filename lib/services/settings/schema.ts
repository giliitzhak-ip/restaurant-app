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

export const billingSettingsSchema = z.object({
  /** A provider may accept work while their balance is at or above this. */
  minimum_balance: z.number().default(0),
  /** Below this, the provider is warned that work will stop. */
  low_balance_threshold: z.number().min(0).default(150),
  refund_on_customer_cancellation: z.boolean().default(true),
  refund_on_provider_cancellation: z.boolean().default(false),
  /** How long after the charge a refund may still be posted automatically. */
  refund_window_hours: z.number().int().positive().default(48),
  topup_presets: z.array(z.number().positive()).min(1).default([100, 250, 500, 1000]),
});

export const verificationSettingsSchema = z.object({
  /** How close the provider's check-in must be to the job address, in metres. */
  arrival_radius_m: z.number().int().positive().default(300),
  require_arrival_checkin: z.boolean().default(true),
  require_completion_photo: z.boolean().default(false),
  require_customer_confirmation: z.boolean().default(true),
  /** A completed job nobody confirms is treated as confirmed after this long. */
  auto_confirm_after_hours: z.number().int().positive().default(48),
  /** Gap between the agreed price and what the customer reports that gets flagged. */
  flag_price_gap_percent: z.number().min(0).max(1).default(0.25),
});

export type BillingSettings = z.infer<typeof billingSettingsSchema>;
export type VerificationSettings = z.infer<typeof verificationSettingsSchema>;
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
  billing: billingSettingsSchema,
  verification: verificationSettingsSchema,
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMAS;

// The shipped defaults live in `./defaults`, which carries no zod dependency so
// that pure logic (fees, matching) can read them without pulling the validator
// into a browser bundle. Re-exported here for callers that want both.
export { SETTINGS_DEFAULTS } from './defaults';
