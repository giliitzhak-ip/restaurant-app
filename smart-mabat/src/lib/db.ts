import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

/** Service-role client. Server only — bypasses RLS, never expose to the browser. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const MEDIA_BUCKET = "media";

export function publicUrl(path: string): string {
  return db().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Throw on Supabase errors so callers can't silently ignore them. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}
