import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UserRole } from '@/types/database';
import { getSessionContext, type SessionContext } from '@/lib/auth/session';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { ApiError } from './errors';

export interface RouteContext {
  session: SessionContext;
  /** RLS-bound client: use this for anything acting on the user's behalf. */
  supabase: SupabaseClient<Database>;
}

/**
 * Every authorisation decision happens here, server-side. The UI hides things
 * for convenience; this is what actually enforces them.
 */
export async function requireSession(): Promise<RouteContext> {
  const supabase = await getServerSupabase();
  if (!supabase) throw ApiError.serviceUnavailable('מסד הנתונים לא מוגדר');

  const session = await getSessionContext();
  if (!session) throw ApiError.unauthorized();

  if (session.status === 'blocked') {
    throw ApiError.forbidden('החשבון חסום. פנה לתמיכה.');
  }
  if (session.status === 'suspended') {
    throw ApiError.forbidden('החשבון מושעה זמנית.');
  }

  return { session, supabase };
}

export async function requireRole(...roles: UserRole[]): Promise<RouteContext> {
  const context = await requireSession();
  if (!roles.includes(context.session.role)) {
    throw ApiError.forbidden();
  }
  return context;
}

export async function requireCustomer(): Promise<RouteContext> {
  return requireRole('customer');
}

export async function requireAdmin(): Promise<RouteContext> {
  return requireRole('admin');
}

export interface ProviderRouteContext extends RouteContext {
  providerId: string;
}

/** Providers must exist and, for job actions, be verified. */
export async function requireProvider(options: { verified?: boolean } = {}): Promise<ProviderRouteContext> {
  const context = await requireRole('provider');
  if (!context.session.providerId) {
    throw ApiError.forbidden('פרופיל בעל המקצוע לא נמצא');
  }
  if (options.verified && context.session.providerStatus !== 'verified') {
    throw ApiError.forbidden('החשבון עדיין לא אומת. לא ניתן לקבל עבודות.');
  }
  return { ...context, providerId: context.session.providerId };
}

/**
 * Privileged client for platform-owned writes (matching, payments, moderation).
 * Callers must have already established authorisation — this bypasses RLS.
 */
export function requireServiceClient(): SupabaseClient<Database> {
  const client = getServiceSupabase();
  if (!client) {
    throw ApiError.serviceUnavailable(
      'הפעולה דורשת מפתח שירות (SUPABASE_SERVICE_ROLE_KEY) שלא הוגדר.',
    );
  }
  return client;
}

export async function logAdminAction(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const client = getServiceSupabase();
  if (!client) return;
  await client.from('admin_actions').insert({
    admin_id: adminId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: details as never,
  });
}
