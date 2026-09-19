import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * A nonce is what makes `script-src` meaningful in an app that ships inline
 * bootstrap scripts: without it the only way to let Next's own inline code run
 * is `'unsafe-inline'`, which switches the protection off for everyone,
 * attackers included.
 *
 * `'strict-dynamic'` lets a nonced script load the chunks it needs without
 * every chunk URL being listed, and modern browsers ignore the host allowlist
 * once it is present — the `https:` entry is only there for older ones.
 *
 * Next.js picks the nonce up from the CSP header on the request and stamps it
 * onto the scripts it renders, so nothing in the app has to thread it through.
 *
 * Lives in `proxy.ts`: Next 16 renamed the `middleware` file convention, and
 * the old name now warns on every build.
 */
const isDev = process.env.NODE_ENV !== "production";

function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function proxy(request: NextRequest) {
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
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:${isDev ? " 'unsafe-eval'" : ""}`,
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
     * Everything except static assets and the image optimiser — those are
     * served straight from disk and carry no scripts.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico|uploads|media).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
