'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { publicEnv } from '@/lib/env';

let cached: SupabaseClient<Database> | null = null;

/**
 * Browser Supabase client. Returns `null` when the project is not configured
 * so that components can degrade to demo mode instead of crashing.
 */
export function getBrowserSupabase(): SupabaseClient<Database> | null {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return null;
  if (!cached) {
    cached = createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  }
  return cached;
}
