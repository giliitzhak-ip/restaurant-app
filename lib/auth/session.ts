import 'server-only';

import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AccountStatus, ProviderStatus, UserRole } from '@/types/database';
import { getServerSupabase } from '@/lib/supabase/server';

export interface SessionContext {
  user: User;
  userId: string;
  role: UserRole;
  status: AccountStatus;
  fullName: string;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  /** Present only for providers. */
  providerId: string | null;
  providerStatus: ProviderStatus | null;
  providerOnboarded: boolean;
}

/**
 * Resolves the signed-in user plus their role.
 *
 * `cache()` dedupes this per request, so a layout, a page and a route handler
 * in the same render all share one round-trip. Always uses `getUser()` — never
 * `getSession()` — so the JWT is verified rather than read from a cookie.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await getServerSupabase();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: appUser }, { data: profile }, { data: provider }] = await Promise.all([
    supabase.from('users').select('role, status, email, phone').eq('id', user.id).maybeSingle(),
    supabase.from('profiles').select('full_name, avatar_url').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('provider_profiles')
      .select('id, status, onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  return {
    user,
    userId: user.id,
    role: appUser?.role ?? 'customer',
    status: appUser?.status ?? 'active',
    fullName: profile?.full_name ?? user.email?.split('@')[0] ?? '',
    avatarUrl: profile?.avatar_url ?? null,
    email: appUser?.email ?? user.email ?? null,
    phone: appUser?.phone ?? user.phone ?? null,
    providerId: provider?.id ?? null,
    providerStatus: provider?.status ?? null,
    providerOnboarded: provider?.onboarding_completed ?? false,
  };
});

export function isRole(context: SessionContext | null, ...roles: UserRole[]): boolean {
  return Boolean(context && roles.includes(context.role));
}

/** Where a user belongs after logging in. */
export function homePathFor(role: UserRole): string {
  switch (role) {
    case 'provider':
      return '/provider';
    case 'admin':
      return '/admin';
    default:
      return '/app';
  }
}
