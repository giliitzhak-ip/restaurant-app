import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';

const PUBLIC_PATHS = ['/login', '/register'];

/**
 * Optimistic gate only: redirects visitors without a session cookie to /login.
 * The authoritative session check runs on the server (requireUser) against the database.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  // Sliding cookie lifetime for active users; the database keeps the authoritative expiry.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && request.method === 'GET') {
    const ttlDays = Number(process.env.SESSION_TTL_DAYS) || 30;
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ttlDays * 24 * 60 * 60,
    });
  }
  return response;
}

export const config = {
  // Everything except Next internals, static files and the health probe.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|api/health).*)'],
};
