import type { NextConfig } from 'next';

/**
 * Response headers applied to every route.
 *
 * Each of these closes something the browser would otherwise allow by
 * default. None of them is a substitute for the server-side checks — RLS and
 * the per-route role checks are the authorization — they are the second line
 * for the cases where the first line has already been got past.
 *
 * There is deliberately NO Content-Security-Policy here. A useful CSP for an
 * App Router build means a nonce threaded through the streaming runtime, and
 * a CSP written without that is either so loose it permits the injection it
 * claims to stop (`unsafe-inline`) or so tight it breaks hydration on the
 * first deploy and gets removed in a hurry. A header that is going to be
 * switched off under pressure is worse than an honest gap. The one place a
 * strict CSP IS applied is where it can be: the private file routes, which
 * serve attacker-supplied bytes and set `default-src 'none'; sandbox`
 * per-response.
 */
const SECURITY_HEADERS = [
  // Stop the browser second-guessing a Content-Type. The document and photo
  // routes serve uploaded bytes; without this, a file the sniffer decides is
  // HTML executes on our origin.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Nothing here is meant to be framed. Clickjacking a provider's "קיבלתי"
  // button is the concrete attack: one invisible frame and a misdirected tap
  // accepts a job on their behalf.
  { key: 'X-Frame-Options', value: 'DENY' },

  // Send the origin, never the path, off-site. A job URL contains an id that
  // identifies a real address and a real person; it does not belong in
  // somebody else's access log.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Geolocation and camera are ours to use and nobody's to borrow: this is a
  // product that asks for a position and for before/after photos, and an
  // embedded third party must not inherit either. The microphone is asked
  // for by nothing, so it is denied outright rather than left to `self`.
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },

  // Cut the window off from anything it opens, so a popup cannot reach back
  // into the session through `window.opener`.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  serverExternalPackages: ['pg'],
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
