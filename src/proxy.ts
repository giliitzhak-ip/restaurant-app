import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * A nonce is what makes `script-src` meaningful in an app that ships inline
 * bootstrap scripts: without it the only way to let Next's own inline code run
 * is `'unsafe-inline'`, which switches the protection off for everyone,
 * attackers included. Next reads the nonce out of the request's CSP header and
 * stamps it onto the scripts it renders, so nothing in the app threads it
 * through by hand.
 *
 * `'strict-dynamic'` is deliberately **not** used, and the reason matters:
 * Next can only inject a nonce into a *dynamically rendered* page, because a
 * statically generated one is built before any request exists. Most of this
 * storefront is static — that is the point of it — so with `'strict-dynamic'`
 * (which makes browsers ignore `'self'`) every static page loses its
 * JavaScript and silently stops hydrating. Add-to-cart becomes a button that
 * does nothing.
 *
 * Keeping `'self' 'nonce-…'` still blocks the attack that matters: injected
 * inline script. What it gives up is narrower — an attacker who can already
 * write a `<script src>` pointing at our own origin — and that trade is worth
 * a storefront that works.
 *
 * Lives in `proxy.ts`: Next 16 renamed the `middleware` file convention, and
 * the old name now warns on every build.
 */
const isDev = process.env.NODE_ENV !== "production";

/**
 * Route guards.
 *
 * These run before rendering, which is the only place a redirect is reliable.
 * A `redirect()` thrown from a layout or page resolves *after* the shell has
 * streamed, so with a loading boundary in the tree it degrades into a
 * client-side instruction — and a visitor without a session ends up looking at
 * a blank account page instead of the login form. Deciding here turns that
 * into an ordinary 307 before a byte of the private route is rendered.
 *
 * The page-level checks stay in place: this is the front door, not the only
 * lock.
 */
const PROTECTED = [
  { prefix: "/account", role: null },
  { prefix: "/admin", role: "ADMIN" as const },
];

const SESSION_COOKIE = "tn_session";

async function sessionRole(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") return null;
  const key = new TextEncoder().encode(
    secret ?? "terra-nova-development-secret-change-me-in-production",
  );
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub) return null;
    return payload.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
  } catch {
    return null;
  }
}

function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const guard = PROTECTED.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );
  if (guard) {
    const role = await sessionRole(request.cookies.get(SESSION_COOKIE)?.value);
    const allowed = role !== null && (guard.role === null || role === guard.role);
    if (!allowed) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login, 307);
    }
  }

  const nonce = makeNonce();

  /** Extra origins the deployment actually talks to. */
  const connectExtras = [
    process.env.STORAGE_PUBLIC_BASE_URL,
    process.env.VISION_API_URL,
    process.env.ERROR_WEBHOOK_URL,
  ]
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value as string).origin;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));

  const imageExtras = process.env.STORAGE_PUBLIC_BASE_URL
    ? [new URL(process.env.STORAGE_PUBLIC_BASE_URL).origin]
    : [];

  const directives = [
    `default-src 'self'`,
    // 'unsafe-eval' is a development-only cost of React Fast Refresh.
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind injects styles at runtime; there is no nonce path for those yet.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:${imageExtras.length ? ` ${imageExtras.join(" ")}` : ""}`,
    `font-src 'self' data:`,
    // blob: covers the canvas renders the designer produces before upload.
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `connect-src 'self'${connectExtras.length ? ` ${connectExtras.join(" ")}` : ""}${isDev ? " ws: wss:" : ""}`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  const csp = directives.join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own internals and static files. `_next` covers
     * chunks, the image optimiser and the dev HMR socket — running a proxy
     * over a websocket upgrade breaks it.
     */
    {
      source: "/((?!api|_next|favicon.ico|icon.svg|robots.txt|sitemap.xml|uploads|media).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
