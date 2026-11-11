import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/** Blocks every page unless the admin session cookie is valid. API routes do their own auth. */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("sm_session")?.value;
  const secret = process.env.SESSION_SECRET;
  let ok = false;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
      ok = payload.role === "admin";
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|setup|api/|_next/|fonts/|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
