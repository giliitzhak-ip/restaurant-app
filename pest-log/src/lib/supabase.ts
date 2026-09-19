import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { clientEnv } from './env';

/**
 * לקוח Supabase יחיד לאפליקציה.
 * ההרשאות נאכפות ב-Row Level Security בצד השרת; הלקוח לא מחזיק סודות
 * מעבר למפתח ה-anon הציבורי.
 */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!clientEnv.isConfigured) {
    throw new Error(
      `חסרה הגדרת סביבה: ${clientEnv.missing.join(', ')}. יש למלא קובץ .env לפי .env.example.`,
    );
  }
  client ??= createClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-application-name': 'yomen-hadbara' },
    },
  });
  return client;
}

/** לבדיקות: הזרקת לקוח מדומה. */
export function setSupabaseForTests(mock: SupabaseClient | null): void {
  client = mock;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export async function getAccessToken(): Promise<string | null> {
  return (await getSession())?.access_token ?? null;
}

/** שליחת קישור התחברות (magic link) או קוד חד-פעמי לדוא״ל. */
export async function signInWithEmail(email: string): Promise<{ error: string | null }> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: clientEnv.authRedirectUrl, shouldCreateUser: false },
  });
  return { error: error ? translateAuthError(error.message) : null };
}

/** אימות קוד חד-פעמי (OTP) שהתקבל בדוא״ל. */
export async function verifyEmailOtp(email: string, token: string): Promise<{ error: string | null }> {
  const { error } = await getSupabase().auth.verifyOtp({ email, token, type: 'email' });
  return { error: error ? translateAuthError(error.message) : null };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'נשלחו יותר מדי בקשות התחברות. יש להמתין דקה ולנסות שוב.';
  }
  if (lower.includes('invalid') && lower.includes('token')) {
    return 'הקוד שהוזן שגוי או פג תוקפו. יש לבקש קוד חדש.';
  }
  if (lower.includes('signups not allowed') || lower.includes('user not found')) {
    return 'כתובת הדוא״ל אינה רשומה במערכת. יש לפנות למנהל העסק כדי להוסיף משתמש.';
  }
  if (lower.includes('expired')) return 'הקישור או הקוד פג תוקף. יש לבקש חדש.';
  return `שגיאת התחברות: ${message}`;
}

/** זמן השרת, לסנכרון שעון המכשיר. */
export async function fetchServerTime(): Promise<Date | null> {
  try {
    // ה-HEAD של ה-REST API מחזיר כותרת Date מהשרת.
    const response = await fetch(`${clientEnv.supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: clientEnv.supabaseAnonKey },
    });
    const header = response.headers.get('date');
    if (!header) return null;
    const parsed = new Date(header);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/** תרגום שגיאות Postgres להודעות בעברית. */
export function translateDbError(error: { code?: string; message: string }): string {
  switch (error.code) {
    case 'P0004':
      return 'היומן עודכן ממכשיר אחר. יש לרענן כדי לראות את הגרסה העדכנית לפני שמירה נוספת.';
    case '42501':
      return 'אין לך הרשאה לפעולה הזו.';
    case '23505':
      return 'הרשומה כבר קיימת במערכת.';
    case 'P0002':
      return 'הרשומה לא נמצאה.';
    default:
      return error.message;
  }
}
