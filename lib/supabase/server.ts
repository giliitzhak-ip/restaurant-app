import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env, hasServiceRole, isSupabaseConfigured } from '@/lib/env';

/**
 * Request-scoped client that carries the signed-in user's session, so every
 * query it runs is subject to Row Level Security.
 */
export async function getServerSupabase(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Privileged client that bypasses RLS. Server-only, and only for operations
 * the platform itself owns: matching, payments, notifications, admin writes.
 * Never hand this to a request whose authorisation has not been checked first.
 */
export function getServiceSupabase(): SupabaseClient<Database> | null {
  if (!hasServiceRole()) return null;
  return createClient<Database>(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
