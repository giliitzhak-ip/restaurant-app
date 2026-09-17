import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isSupabaseConfigured } from '@/lib/env';

const PROTECTED_PREFIXES = ['/app', '/provider', '/admin'];
const AUTH_ROUTES = ['/login', '/signup', '/verify'];

/**
 * Refreshes the Supabase session cookie on every request and does a coarse
 * authenticated/anonymous redirect. (Next 16 renamed this file convention from
 * `middleware` to `proxy`; the behaviour is the same.)
 *
 * Role enforcement deliberately does NOT happen here: the proxy cannot be the
 * security boundary. Each area's server layout re-checks the role, every API
 * route goes through `requireRole`, and Row Level Security backstops both.
 */
export default async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // Without Supabase there is no session to gate on. Let the request through so
  // the area layouts can explain demo mode instead of bouncing to a login page
  // that cannot work either.
  if (!isSupabaseConfigured()) return response;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (userId && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets — the session cookie
     * must be refreshed on navigations, not on image requests.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)',
  ],
};
