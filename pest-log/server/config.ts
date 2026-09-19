/**
 * הגדרות שירות השרת.
 * כל הסודות מגיעים ממשתני סביבה בלבד — אין סודות בקוד.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('REPLACE_WITH') || value.includes('YOUR-PROJECT-REF')) {
    throw new Error(
      `חסר משתנה סביבה ${name}. יש להעתיק את .env.example ל-.env ולמלא אותו (ראו README).`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

export interface ServerConfig {
  port: number;
  supabaseUrl: string;
  serviceRoleKey: string;
  jwtSecret: string;
  allowedOrigins: string[];
  rateLimit: number;
  rateWindowMs: number;
  signedUrlTtlSeconds: number;
  verifyBaseUrl: string;
}

export function loadConfig(): ServerConfig {
  return {
    port: Number(optional('PDF_SERVICE_PORT', '8787')),
    supabaseUrl: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    jwtSecret: required('SUPABASE_JWT_SECRET'),
    allowedOrigins: optional('PDF_SERVICE_ALLOWED_ORIGINS', 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    rateLimit: Number(optional('PDF_SERVICE_RATE_LIMIT', '10')),
    rateWindowMs: Number(optional('PDF_SERVICE_RATE_WINDOW_MS', '60000')),
    signedUrlTtlSeconds: Number(optional('SIGNED_URL_TTL_SECONDS', '300')),
    verifyBaseUrl: optional('PUBLIC_VERIFY_BASE_URL', 'http://localhost:5173/verify'),
  };
}
