import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "sfm_session";
const PROTECTED = ["/dashboard", "/projects", "/face-swap", "/account", "/system"];

/**
 * Cheap edge redirect based on cookie presence only. The real session check
 * happens server-side in every protected page and API route.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/projects/:path*", "/face-swap/:path*", "/account/:path*", "/system/:path*"] };
