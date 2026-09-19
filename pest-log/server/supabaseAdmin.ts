import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerConfig } from './config';

/**
 * לקוח service role. עוקף RLS ולכן מופעל אך ורק בצד השרת, אחרי אימות
 * ה-JWT של המשתמש ואחרי בדיקה שהיומן שייך לארגון שלו.
 */
export function createAdminClient(config: ServerConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const STORAGE_BUCKET = 'pest-log-files';
