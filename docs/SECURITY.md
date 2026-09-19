# Security

What this application assumes, what it enforces, and what it deliberately does
not try to do. Written for whoever operates it after us.

## The production contract

`src/config/env.ts` refuses to start a production instance that is not fit to
take real orders. `src/instrumentation.ts` runs the check once per process, so
a bad deploy fails immediately and visibly instead of at the first customer.

| Variable | Why it is mandatory in production |
| --- | --- |
| `DATABASE_URL` | Without it the app falls back to an in-memory store that loses every order, account and saved design on restart and disagrees with itself across instances. |
| `AUTH_SECRET` | Signs the session cookie. Must be ≥32 characters and must not contain `change-me` or `development`. |
| `NEXT_PUBLIC_SITE_URL` | Canonicals, sitemap, OG tags and payment return URLs are built from it. Must be `https://`. |
| `STORAGE_DRIVER=remote` + its five settings | The local driver writes customer photos to a container disk that is not shared between instances and disappears on deploy. |
| `RATE_LIMIT_REDIS_URL` | The in-process limiter is per-instance; behind more than one container it does not actually limit anything. |
| `SEED_ADMIN_PASSWORD` | Optional, but if set it must be ≥12 characters and not a guessable default. A production seed refuses to run without explicit admin credentials and does not create the demo customer. |

`APP_ENV` overrides `NODE_ENV` for this check. CI sets `APP_ENV=test` because
`next start` always reports production; a real deployment sets nothing. This
is a statement about the environment, not a switch that disarms the checks —
do not set it on a live instance.

## Authorisation

**Orders.** The order number is sequential and printed on paperwork, so it is
not a secret. Every order carries a 256-bit `publicToken`; the confirmation
page resolves on that token or on session ownership, and answers `404`
otherwise — not `403`, which would confirm the order exists.

**Saved designs.** A design belongs to an account or to a guest cookie. Every
read, write, rename, delete, duplicate, cart-add and quote attachment goes
through `requireDesignOwnership()` in `src/server/security/ownership.ts`. The
guest token is compared in constant time, and a row with no owner is refused.
`guestToken` is stripped before a design crosses into a client component.

**Private routes.** `/account/*` and `/admin/*` are decided in `src/proxy.ts`,
before rendering, because a `redirect()` thrown from a layout resolves after
the shell has streamed and can degrade into a client instruction that never
runs. Each page also checks its own session — the proxy is the front door, not
the only lock.

## Payments

Only `POST /api/payments/webhook` may move an order to `PAID`. A customer
returning from the payment page proves nothing: that redirect is a GET they
control. The webhook verifies, in order:

1. an HMAC-SHA256 signature over the **raw** request body (constant-time);
2. that the referenced order exists and is in a state that may move;
3. that the amount matches the total the server computed;
4. that the currency matches.

Replays are no-ops: the provider's event id is `UNIQUE` in
`PaymentTransaction`, and every status change is a compare-and-set through the
state machine in `src/server/commerce/order-flow.ts`.

Card data never reaches the application. `scrubPaymentPayload()` redacts
anything card-shaped before a provider payload is logged, so the payment table
stays outside PCI scope.

**Not yet production-ready.** No gateway is wired up. Before taking real
payments: implement the provider's request and callback format in
`src/server/payments/hosted-gateway.ts`, set `PAYMENT_WEBHOOK_SECRET`, and run
the provider's sandbox end to end — a successful capture, a decline, a
cancellation and a replayed callback. Until that has been done, treat the
payment path as untested against a real provider.

## Uploads

Nothing is written through on the browser's word. Every uploaded image is
size-checked, identified by magic bytes, then fully decoded and re-encoded by
sharp (`src/server/security/images.ts`). What reaches storage is our own WebP,
so polyglot files do not survive the round trip and EXIF — including GPS
coordinates of the customer's home — is dropped. This applies to room photos,
canvas renders, quote attachments and admin uploads alike.

## Rate limiting

`src/server/security/rate-limit.ts`, applied to login, registration,
newsletter, quotes, checkout, room analysis and uploads. Redis (Upstash REST)
in production, in-process in development. Login is limited per account *and*
per client, so neither spraying nor grinding goes unnoticed.

## Account enumeration

Login answers identically for "no such account" and "wrong password", and
burns the same bcrypt time on a missing account so the timing does not give it
away either.

Registration is narrowed but **not closed**: a signup form that refuses a
duplicate always tells you something. Closing it properly means always
answering "check your inbox" and doing the real work in a verified email,
which needs a mail provider this app does not have yet. The error copy is
deliberately vague in the meantime.

## Content-Security-Policy

Set per request in `src/proxy.ts` with a nonce. `'strict-dynamic'` is
deliberately **not** used: Next can only inject a nonce into a dynamically
rendered page, and most of this storefront is static, so `'strict-dynamic'`
(which makes browsers ignore `'self'`) silently stops every static page from
hydrating. `'self' 'nonce-…'` still blocks injected inline script; what it
gives up is narrower and worth a storefront that works.

## Retention

`POST /api/maintenance/retention` deletes designs past their window and the
image files with them. POST only — a destructive job behind GET is one
prefetch or one `<img>` tag away from running by accident. The token is
compared in constant time.

Defaults: 7 days for a guest, a year for a signed-in customer
(`src/config/brand.ts`).

## Dependencies

`npm audit` is clean. Two advisories reached us through the Prisma CLI:

- **mysql2** (auth-plugin downgrade, decompression bomb) — unreachable here,
  since this app is PostgreSQL, but pinned forward anyway.
- **deepmerge-ts** (via `@prisma/config`) — pinned forward.

Both are `overrides` in `package.json`, pinning the transitive dependency to a
patched version. `npm audit fix --force` was **not** used: it resolves these by
downgrading Prisma 7 to 6.19.3, which would break the driver-adapter setup, the
`prisma.config.ts` requirement and the generated client path. Pin the child,
do not downgrade the parent.

Re-check with `npm audit` after any dependency bump, and drop an override once
the parent ships the fixed range itself.

## Known gaps

Stated plainly so they are decisions rather than surprises:

- No gateway integration has been tested against a sandbox (see **Payments**).
- Registration still reveals whether an address is taken (see above).
- The rate limiter fails open if Redis is configured but unreachable, so the
  shop stays up; the miss is logged.
- There is no CAPTCHA on the quote form. Rate limiting is the only defence
  against a determined spammer.
- Admin actions are audited, but the audit log has no UI yet — read it from
  the database.
