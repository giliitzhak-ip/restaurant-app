import type { UserRole } from '@/lib/auth';

/**
 * Where a `?next=` parameter is allowed to send somebody.
 *
 * Two separate problems live behind one innocent-looking query parameter, and
 * the fix has to answer both:
 *
 * 1. **Off-site.** `?next=https://evil.example` turns our own login screen
 *    into a redirector that carries our domain's credibility to somebody
 *    else's page. This is the classic phishing amplifier, and the reason the
 *    only shape accepted here is a path — never a URL, never a scheme.
 * 2. **Wrong role.** `?next=/admin` on a customer's sign-in does not grant
 *    anything (every admin screen re-checks on the server), but it lands the
 *    customer on a screen that will refuse them, which reads as a broken
 *    product. The destination has to fit who just signed in.
 *
 * Nothing here is an authorization decision. RLS and the per-page server
 * checks are the authorization. This is about not sending people somewhere
 * hostile or somewhere pointless.
 */

/** Where each role belongs when there is nothing better to go on. */
const DEFAULT_PATH: Record<UserRole, string> = {
  customer: '/',
  provider: '/provider',
  admin: '/admin',
};

/**
 * The surface each role may be sent to.
 *
 * An entry matches its own exact path and anything beneath it, so `/jobs`
 * covers `/jobs/<id>` without listing every id. `/` matches only itself —
 * otherwise it would match every path there is and the check would be
 * decoration.
 */
const ALLOWED_PREFIXES: Record<UserRole, readonly string[]> = {
  customer: ['/', '/request', '/jobs'],
  provider: ['/provider'],
  admin: ['/admin', '/matching-lab'],
};

/** C0 and C1 control characters, including the tab/newline used to smuggle schemes. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** `scheme:` at the start of the value — `javascript:`, `data:`, `https:`. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Long enough for a request carried across a sign-in, short enough to bound the work. */
const MAX_PATH_LENGTH = 2048;

/** The part before `?` or `#` — the only part a role check should look at. */
function pathnameOf(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

/**
 * Accept a same-origin path, or nothing.
 *
 * Deliberately not built on `new URL(value, base)`: that parses far more than
 * we want to accept, and every "is the host still ours" comparison written
 * that way has a history of being wrong about one browser or another. A
 * whitelist of shapes is smaller than the set of URLs that resolve off-site.
 */
export function safeInternalPath(candidate: string | null | undefined): string | null {
  if (typeof candidate !== 'string') return null;
  if (candidate.length === 0 || candidate.length > MAX_PATH_LENGTH) return null;

  // No trimming. A value with leading whitespace is not a path we produced,
  // and trimming is how `\n//evil.example` becomes `//evil.example`.
  if (CONTROL_CHARS.test(candidate)) return null;

  // Unreachable while the next check stands, since a path starts with `/` and
  // cannot then match `scheme:`. Kept because it states the rule the value
  // must satisfy rather than relying on a second rule to imply it.
  if (HAS_SCHEME.test(candidate)) return null;

  if (!candidate.startsWith('/')) return null;

  // `//evil.example` is protocol-relative: the browser reads it as a host,
  // not a path, and it is the single most common bypass of a naive
  // "starts with /" check. `/\evil.example` is the same trick spelled with
  // the separator that Windows-era parsers accept.
  if (candidate.startsWith('//')) return null;
  if (candidate.includes('\\')) return null;

  const pathname = pathnameOf(candidate);

  // A `..` segment is an attempt to reach a prefix the role check below would
  // otherwise refuse: `/provider/../admin` passes a naive prefix match.
  if (pathname.split('/').includes('..')) return null;

  /*
   * Percent-encoding is checked against the DECODED value, because that is
   * what the browser acts on: `/%5Cevil.example` and `/%2F%2Fevil.example`
   * are the same two attacks written once removed. A value that will not
   * decode is malformed and therefore not one of ours.
   */
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (CONTROL_CHARS.test(decoded) || decoded.includes('\\') || decoded.startsWith('//')) {
    return null;
  }

  return candidate;
}

/** Where this role lands when the request did not name a destination we can honour. */
export function defaultPathForRole(role: UserRole): string {
  return DEFAULT_PATH[role] ?? '/';
}

function fitsRole(pathname: string, role: UserRole): boolean {
  const prefixes = ALLOWED_PREFIXES[role];
  if (!prefixes) return false;
  return prefixes.some(
    (prefix) =>
      pathname === prefix || (prefix !== '/' && pathname.startsWith(`${prefix}/`)),
  );
}

/**
 * The destination to actually use after signing in.
 *
 * Always returns somewhere: a rejected `next` is not an error the person has
 * to read and act on, it is a request we quietly decline to honour. Callers
 * pass `fallback` when the role default is not right for the moment — a
 * provider who just registered has no trade yet, so their console would be a
 * dead end and onboarding is the better landing.
 */
export function redirectPathForRole(
  candidate: string | null | undefined,
  role: UserRole,
  fallback: string = defaultPathForRole(role),
): string {
  const safe = safeInternalPath(candidate);
  if (!safe) return fallback;

  return fitsRole(pathnameOf(safe), role) ? safe : fallback;
}
