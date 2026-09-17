/**
 * Environment access.
 *
 * Nothing here throws at import time: the app must boot with an empty `.env`
 * so that a developer can explore it before wiring Supabase. Instead each
 * integration asks whether it is configured and falls back to a mock.
 */

const optional = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // `.env.example` placeholders must not be mistaken for real configuration.
  if (trimmed.startsWith('your-') || trimmed.includes('your-project-ref')) return null;
  return trimmed;
};

export const env = {
  supabaseUrl: optional(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: optional(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseServiceRoleKey: optional(process.env.SUPABASE_SERVICE_ROLE_KEY),

  mapsProvider: (optional(process.env.NEXT_PUBLIC_MAPS_PROVIDER) ?? 'mock') as
    | 'google'
    | 'mapbox'
    | 'mock',
  mapsServerKey: optional(process.env.MAPS_API_KEY),
  mapsBrowserKey: optional(process.env.NEXT_PUBLIC_MAPS_API_KEY),

  paymentProvider: (optional(process.env.PAYMENT_PROVIDER) ?? 'mock') as
    | 'stripe'
    | 'israeli'
    | 'mock',
  paymentSecretKey: optional(process.env.PAYMENT_SECRET_KEY),
  paymentWebhookSecret: optional(process.env.PAYMENT_WEBHOOK_SECRET),

  notificationsMode: (optional(process.env.NOTIFICATIONS_MODE) ?? 'console') as 'console' | 'live',
  smsApiKey: optional(process.env.SMS_API_KEY),
  emailApiKey: optional(process.env.EMAIL_API_KEY),
  emailFrom: optional(process.env.EMAIL_FROM) ?? 'no-reply@getservice.example',
  pushApiKey: optional(process.env.PUSH_API_KEY),
  whatsappApiKey: optional(process.env.WHATSAPP_API_KEY),

  aiClassifierProvider: (optional(process.env.AI_CLASSIFIER_PROVIDER) ?? 'mock') as 'mock' | 'llm',
  aiClassifierApiKey: optional(process.env.AI_CLASSIFIER_API_KEY),

  appUrl: optional(process.env.NEXT_PUBLIC_APP_URL) ?? 'http://localhost:3000',
  defaultLocale: optional(process.env.NEXT_PUBLIC_DEFAULT_LOCALE) ?? 'he',
} as const;

/** True when Supabase is wired up. When false the app runs in demo mode. */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/** True when server-side privileged operations (matching, payments) can run. */
export function hasServiceRole(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

/**
 * Public env for the browser. Only ever contains NEXT_PUBLIC_* values —
 * never read this on the server expecting secrets.
 */
export const publicEnv = {
  supabaseUrl: env.supabaseUrl,
  supabaseAnonKey: env.supabaseAnonKey,
  mapsProvider: env.mapsProvider,
  mapsBrowserKey: env.mapsBrowserKey,
  appUrl: env.appUrl,
  defaultLocale: env.defaultLocale,
} as const;
