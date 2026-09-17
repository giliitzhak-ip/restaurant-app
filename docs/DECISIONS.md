# Decision Register

Architectural decisions, why they were made, what was rejected, and what each
one costs.

---

## D-001 — RLS is enforced the way PostgREST does it, not by application checks

**Date:** 2026-09-17

**Decision.** The application connects as a dedicated login that is
`NOSUPERUSER`, `NOBYPASSRLS`, `NOINHERIT` and *not* the table owner. Every
user-facing request opens a transaction, runs `SET LOCAL ROLE authenticated`,
sets `request.jwt.claims` to `{"sub": "<user id>"}`, and lets RLS decide.
Trusted server work uses `service_role` (`BYPASSRLS`), which no browser can
reach.

**Why.** It makes the database the enforcement point (§23, §45). A bug in a
route handler cannot expose another customer's job, because the connection
itself cannot see it. It is also exactly Supabase's model, so the same
policies run locally and in production (A-009).

**Alternatives rejected.**
- *Application-level checks with a privileged connection.* One forgotten
  `where customer_id = ?` becomes a data breach.
- *Supabase client SDK from the browser.* Would have meant no verified local
  test of the policies, and the spec forbids frontend-trusted authorization.

**Trade-offs.** Two round trips per request for the role and claim setup;
every user-facing query must run inside `withUser()`; and `SECURITY DEFINER`
helpers are required to break policy recursion (D-005).

**Verification.** `tests/security/` — 25 tests through the real connection,
plus a self-check suite proving the harness can fail.

---

## D-002 — Local PostgreSQL + PostGIS instead of a Supabase project

**Date:** 2026-09-17

**Decision.** Develop and test against a local PostgreSQL 16 + PostGIS 3.4,
with migrations written to be Supabase-compatible.

**Why.** No Supabase credentials were available. The alternative was writing
code against an SDK that could never be executed — which is the "integration
you claim works but never tested" that §53 forbids. With a real database, the
schema, the spatial queries, the transactional acceptance function, the
triggers and all 53 RLS policies are genuinely executed and tested.

**Trade-offs.** Supabase Auth, Storage and Realtime are not exercised;
server-side sessions, a signed-URL storage boundary and LISTEN/NOTIFY stand in
their place. Realtime and payments sit behind interfaces so swapping them is
additive.

---

## D-003 — The job state machine lives in a table, mirrored in TypeScript

**Date:** 2026-09-17

**Decision.** Legal transitions are rows in `job_transitions`, enforced by a
`BEFORE UPDATE OF status` trigger that also writes the audit row. The
TypeScript map in `src/domains/jobs/state-machine.ts` mirrors it, and a test
asserts they are identical across all 240 status pairs.

**Why.** The database must be the source of truth (§22), and every transition
must be validated server-side (§20) regardless of which code path performed
the update. Mirroring in TypeScript lets the UI disable impossible actions
without a round trip.

**Alternatives rejected.**
- *TypeScript only.* Any direct SQL — a migration, an admin script, a bug —
  bypasses it.
- *A `CASE` statement in the trigger.* Not queryable, so the UI could not read
  it and no parity test would be possible.

**Trade-offs.** Two definitions to keep in step. Mitigated by the exhaustive
parity test, which fails loudly on drift.

**Proof it is real:** a fixture attempting `PROVIDER_SELECTED → COMPLETED`
directly is refused *even as the table owner*.

---

## D-004 — Route-opportunity scoring is piecewise, with a gap between bands

**Date:** 2026-09-17

**Decision.** A provider inside the on-the-way threshold scores 85–100; one
past it scores from 70 downward. The gap is deliberate.

**Why.** Found by testing end to end. With a single linear ramp from 0 → 100
minutes of detour, a provider needing a **6.2-minute detour still scored
75/100** and beat a provider passing the customer's door by 0.2 points once
rating and price were counted. `isOnTheWay` flipped at the threshold while the
score moved by almost nothing, which made the threshold cosmetic and let small
price or rating edges quietly outvote the product's primary signal.

"Already passing your street" and "has to turn around" are not two points on
one smooth line, and the scoring now says so.

**Trade-offs.** A discontinuity at the threshold: a provider at 5.9 minutes
scores ~85 and one at 6.1 scores ~70. That is intended — it is the same
cliff the `isOnTheWay` flag already had — but it makes the threshold value
itself load-bearing, and it is configurable for that reason.

**Honest caveat.** Even after the fix the winning margin in the adversarial
case is 0.2–1.3 points. The thesis holds at the specified weights; it is not
robust to arbitrary weightings. See A-004 and R-001.

---

## D-005 — Cross-table policy lookups go through `SECURITY DEFINER` helpers

**Date:** 2026-09-17

**Decision.** Any policy needing to consult another table calls a
`SECURITY DEFINER` function (`job_customer_id`, `provider_has_interest_in_job`,
`customer_may_track_provider`, `can_review`, …) rather than an inline
subquery.

**Why.** Forced by a real failure. The first version had the `jobs` policy
query `job_offers`, whose own policy queried `jobs`. PostgreSQL detected the
cycle and every job read failed with *"infinite recursion detected in policy
for relation jobs"*. `SECURITY DEFINER` runs with the owner's rights, so the
inner table's policies are not re-evaluated and the cycle breaks. The
authorization logic is unchanged.

**Trade-offs.** These functions bypass RLS by construction, so each one must
be narrow and audited; they are small, single-purpose, and pinned with
`set search_path = public`.

---

## D-006 — UI primitives hand-written in the shadcn/ui idiom

**Date:** 2026-09-17

**Decision.** `src/components/ui/index.tsx` implements the primitives
directly instead of scaffolding them with the shadcn CLI.

**Why.** The CLI expects interactive scaffolding and writes a component set
larger than this product needs. The primitives follow the same conventions —
composition, class variants, no runtime theme layer — and Tailwind v4's
CSS-first `@theme` already provides the token system.

**Trade-offs.** No automatic upstream updates. The surface is small enough
(button, card, badge, field, states, money/distance/rating formatters) that
this is cheaper than the dependency.

---

## D-007 — Payments abstracted, with a mock that cannot pretend to be real

**Date:** 2026-09-17

**Decision.** `PaymentProvider` defines authorize/capture/refund/payout, each
taking an idempotency key. The only implementation is `MockPaymentProvider`,
which reports `isReal = false`. The UI labels such payments as test payments,
and `assertPaymentProviderIsSafe()` refuses to run a non-real adapter in
production.

**Why.** §53 forbids fake payment success. The mock is a real implementation
of the contract — it enforces idempotency, rejects over-capture and
over-refund, and can be made to fail deterministically — but it is
structurally incapable of claiming a real charge.

**Trade-offs.** No real gateway is integrated, so the production payment path
is unproven beyond the interface.

---

## D-008 — Realtime carries identifiers, never row data

**Date:** 2026-09-17

**Decision.** `NOTIFY` payloads contain ids and a status. Clients react by
re-reading the authoritative row through RLS.

**Why.** Realtime is a synchronisation mechanism, not a source of truth
(§22). Two consequences fall out for free: a dropped connection costs one
refetch instead of correctness (§44), and the realtime path cannot leak a row
the subscriber is not allowed to read, because it never carries one.

**Trade-offs.** An extra fetch per event. Worth it; polling remains as a
safety net so realtime is an optimisation, never a dependency.

---

## D-009 — Money in integer agorot

**Date:** 2026-09-17

**Decision.** All amounts are integer minor units. `numeric(10,2)` is used for
human-facing prices in the catalog, but everything financial is integer
agorot.

**Why.** 15% of ₪290 must not depend on binary floating point. Tests assert
`platformFee + providerAmount === grossAmount` exactly across a range of
values.

---

## D-010 — Integration tests run against a dedicated database

**Date:** 2026-09-17

**Decision.** `npm run test:db` creates `getservice_test`, migrated but never
seeded with demo data. `tests/setup.ts` redirects the connection there.

**Why.** Found by a failure. The suites originally shared the development
database, where the demo seed places 22 providers around Tel Aviv — inside the
radius the dispatch tests search. Seven tests passed or failed depending on
whether `db:seed` had been run. A test whose result depends on unrelated data
is not a test.

**Trade-offs.** One more setup step, documented in the README. Verified by
re-seeding development and re-running: unaffected.

---

## D-011 — The legacy restaurant app was preserved, not deleted

**Date:** 2026-09-17

**Decision.** The existing Node/SQLite restaurant-order system moved to
`legacy-restaurant/` with `git mv`, keeping its history. GET SERVICE occupies
the repository root.

**Why.** §68 says not to overwrite working code blindly. It is unrelated to
this product but it worked, and it is preserved rather than discarded. It is
excluded from the TypeScript and ESLint configuration so it cannot affect the
new build.

---

## D-012 — TypeScript 5.9 and ESLint 9, not the newest available

**Date:** 2026-09-17

**Decision.** Pinned TypeScript 5.9.3 and ESLint 9.39.5, although 7.0.2 and
10.10.0 exist.

**Why.** Verified, not assumed. `eslint-config-next@16.3.5` declares
`eslint >= 9`, but the `eslint-plugin-react` it bundles calls
`context.getFilename()`, removed in ESLint 10 — every lint run crashed with
`TypeError: contextOrFilename.getFilename is not a function`. A permissive
peer range is not evidence of compatibility. TypeScript 5.9 is the version
Next.js 16 is tested against.
