/**
 * גישה מבוקרת למשתני הסביבה של צד הלקוח.
 * רק משתני VITE_ נחשפים לדפדפן. סודות (service role, JWT secret) אינם כאן.
 */

interface ClientEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  pdfServiceUrl: string;
  authRedirectUrl: string;
  /** true כאשר חסרה הגדרה — הממשק מציג הסבר ולא נופל. */
  isConfigured: boolean;
  missing: string[];
}

function read(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isPlaceholder(value: string): boolean {
  return value.length === 0 || value.startsWith('REPLACE_WITH') || value.includes('YOUR-PROJECT-REF');
}

export function readClientEnv(): ClientEnv {
  const supabaseUrl = read('VITE_SUPABASE_URL');
  const supabaseAnonKey = read('VITE_SUPABASE_ANON_KEY');
  const pdfServiceUrl = read('VITE_PDF_SERVICE_URL');
  const authRedirectUrl = read('VITE_AUTH_REDIRECT_URL') || `${globalThis.location?.origin ?? ''}/auth/callback`;

  const missing: string[] = [];
  if (isPlaceholder(supabaseUrl)) missing.push('VITE_SUPABASE_URL');
  if (isPlaceholder(supabaseAnonKey)) missing.push('VITE_SUPABASE_ANON_KEY');
  if (isPlaceholder(pdfServiceUrl)) missing.push('VITE_PDF_SERVICE_URL');

  return {
    supabaseUrl,
    supabaseAnonKey,
    pdfServiceUrl,
    authRedirectUrl,
    isConfigured: missing.length === 0,
    missing,
  };
}

export const clientEnv = readClientEnv();
