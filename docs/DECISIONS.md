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

---

## D-013 — The realtime switch outranks the weekly plan for a "now" request

**Context.** A provider states availability twice: a live switch, and a weekly
schedule. They disagree constantly — someone whose plan is Sunday–Thursday
08:00–17:00 taps "accepting jobs" at 20:00 on a Thursday.

**Decision.** For a request at or near now, the switch decides. For a future
slot, the plan decides. A **date override** outranks both, for its date only.

**Why.** The switch is the more specific, more recent and more deliberate
statement: the provider is answering "right now" with a tap, having seen the
current time. A weekly plan is a default. But "I'm off today" is a decision
about today, not a default, which is why overrides sit above both.

**Consequences.** `provider_planned_covers()` could not serve both branches,
because it returned plain `false` for an override *and* for an uncovered hour
— so the "now" branch treated the two identically. Migration `0022` adds
`provider_override_verdict()` so each layer answers only for itself. Before
the split, the "available for two hours" and "available until 18:00" actions
silently did nothing outside planned hours: the provider was shown as
available and matched as unavailable.

## D-014 — Temporary availability is enforced in the predicate, not by a sweeper

**Context.** A provider who taps "accepting jobs" almost never means "until I
remember to turn this off". They mean two hours, or until six.

**Decision.** `provider_profiles.online_until` gives the switch an optional
end, checked **inside** `provider_is_available_at()`. A sweeper
(`expire_online_windows()`, run from the maintenance tick) exists as well, but
only to reconcile the visible state.

**Why.** Matching must never depend on a background job having run. If the
expiry lived only in the sweeper, a missed tick would send work to someone who
had finished for the day — the exact failure the feature exists to prevent.

**Consequences.** Two sources of truth that must agree, and they are tested to:
one test asserts matching refuses an expired window *before* any sweep, and
that the provider record still reads `ONLINE` at that moment — which is
precisely the state the sweeper is for.

## D-015 — Dead configuration is deleted, not left as documentation

**Context.** `availability.rules` carried `noRulesMeansAlwaysPlanned: true`,
whose own description claimed it "keeps a provider who never set hours
matchable via their realtime switch". Nothing read the key, and a comment in
migration `0022` cited it as though it were load-bearing.

**Decision.** Migration `0023` removes it and states the real rule: no
declared hours means matchable now through the switch, never for a future
slot.

**Why.** A flag that describes behaviour nothing implements is worse than no
flag. It reads as the explanation for what the system does, so the next
person changes it and nothing happens — or, worse, trusts it and reasons from
a false premise. Implementing it would also have been wrong: dispatching an
03:00 Tuesday job to someone who never said they work then, and cannot be
asked, manufactures availability out of an absence of data.

## D-016 — SQL relation references are asserted structurally

**Context.** Migration `0017` renamed `provider_availability` to
`provider_status_history`. `/api/provider/state` kept writing the old name, so
going online returned 500 — with types, lint, build and 164 tests all green,
because SQL inside a template literal is just text.

**Decision.** `tests/integration/sql-references.test.ts` extracts every
relation named in every query under `src/` and asks the database whether it
exists.

**Why.** A per-route test would have caught that one route. This catches the
class, stays cheap as routes are added, and needs no maintenance. Verified by
reverting the fix and watching it fail.

**Consequences.** The extractor is heuristic — it strips SQL comments, ignores
CTE names and set-returning function calls — and asserts it found at least 40
references, so a silently broken extractor cannot pass as a clean run.

## D-017 — Grants are part of the security model, so they are tested

**Context.** Migration `0017` granted two new tables to `authenticated` only.
Every provider action on their own hours worked; every *system* read returned
42501, which the API faithfully reports as `403 FORBIDDEN`. The result was a
permission error on screens where permission was never the question.

**Decision.** `tests/security/grants.test.ts` asserts the shape of the grants
rather than a list of tables: `service_role` can read every application table;
everything granted to `authenticated` has RLS enabled; `anon` can read the
catalog and write nothing. Plus a behavioural check that a signed-in non-admin
cannot write `settings` or the catalog — since `authenticated` legitimately
holds those privileges and RLS, not the grant, is what separates an admin.

**Why.** Shape-based assertions cover a new table the day it is added. The
behavioural check exists because the grant is correct and the policy is
load-bearing, which is worth proving rather than reading off an ACL.

## D-018 — COMPARE mode is refused, not disabled

**Context.** The "עבודה גדולה" flow created a job in `COMPARE` mode that
nothing dispatched, with no screen to compare quotes on.

**Decision.** Removed from the UI **and** from the API's accepted values.

**Why.** An absent feature is a gap; a button that promises it is a lie the
customer pays for with a request that goes nowhere. Leaving the API able to
create such a job keeps the dead end reachable — and a stuck job looks like a
bug in dispatch rather than an unbuilt feature.

## D-019 — The UI audit runs against a production build

**Context.** Every earlier UI audit ran against `next dev`. In this sandbox
the dev server's hot-reload websocket cannot complete a handshake, and Next
then never finishes hydrating: event handlers are dead and client effects
never run. Clicking a login button fired no request at all. Every screenshot
was of server-rendered HTML and every check passed on it.

**Decision.** The audit probes hydration directly (React's fibre keys on a
real DOM node), fails a page still showing a loading label, and documents
that it must run against `next start`.

**Why.** An audit that passes dead pages is worse than no audit: it converts
"unverified" into "verified" without anyone deciding to.

**Consequences.** Two further audit faults surfaced once it was telling the
truth — it logged in once per page and tripped the login rate limiter, so
later pages rendered signed out; and it counted a wrapping `<label>` as an
unlabelled input, pushing authors towards redundant ARIA on correct markup.

---

## D-020 — Multi-offer model: first to accept wins

**Context.** §10 left three models open, and the register recorded the choice
as an unresolved product decision with different schema consequences:

1. **Quotes** — providers bid, the customer compares and picks.
2. **Pick-a-candidate** — the customer chooses from a ranked shortlist.
3. **First-accept-wins** — offers go out to several providers at once, and
   the first to accept gets the job.

**Decision.** First-accept-wins, confirmed by the product owner.

**Why.** It is the only one of the three that keeps the promise the product
is built on. The strongest signal in matching is *who is already going there*,
and that is a perishable fact: a provider two minutes from the door is the
best answer for about two minutes. A quote round or a shortlist spends that
window asking the customer to do work the ranking has already done, and by
the time they choose, the reason that provider was best has expired.

It is also the only model where the customer's decision is small. One match,
with a price and an ETA, is a yes-or-no. A shortlist of three plausible
strangers is a research task the customer is not equipped for and did not ask
for — they wanted the leak fixed.

**Consequences.**

* Dispatch sends up to `maxProviders` offers per wave concurrently, and
  `accept_job_offer()` is the race: `SELECT … FOR UPDATE` on the job plus
  `UNIQUE(job_id)` on `job_assignments`, so exactly one provider can win and
  the losers get `JOB_ALREADY_ASSIGNED`.
* The customer sees one match at a time, never an offer list. `GET
  /api/jobs/:id` deliberately does not return `job_offers` to them.
* **Rejecting a match had to become its own action.** With one match on
  screen, the only previous way out was cancelling the whole request and
  retyping it — and rejecting a person is not the same intention as
  abandoning the job. `POST /api/jobs/:id/reject-match` frees the provider,
  excludes them from this job, and searches again. Capped at three per job,
  because each rejection excludes a provider and without a cap the button
  walks the ranked list — a provider directory by another name.
* Rejecting does **not** count against the provider's `cancelled_jobs`. They
  accepted in good faith; a reliability score that punishes them for someone
  else's change of mind is a broken score.
* §10's "several genuinely different options → show at most three" branch and
  `COMPARE` mode are now decided against rather than pending (D-018).

## D-021 — Losing a race is not the same as having had your chance

**Context.** `find_candidate_providers()` excluded any provider with **any**
offer row for the job. Under first-accept-wins, `accept_job_offer()` cancels
every competing offer the instant someone wins, so that predicate excluded
most of the wave, every time.

**Decision.** Migration `0024`: a provider is out of the running only if they
actually had their chance — an offer still live, declined, expired, held, or
one the customer rejected them on specifically. An offer `CANCELLED` with no
`decline_reason` means "someone else won", and those providers stay eligible.
Migration `0010`'s `accept_job_offer()` and `rejectMatch()` are the only two
writers of `CANCELLED`, and `decline_reason` is what tells them apart.

**Why it mattered.** Both re-dispatch paths were dead ends. A provider who
accepted and then withdrew, or a match the customer rejected, sent the job
back to `SEARCHING` — where wave 1 skipped everyone who had merely lost by a
second. In a thin market that is everyone, and the request died.

**Consequences.** `job_offers` is still `UNIQUE(job_id, provider_id)`
(A-010), so a re-offer **revives the existing row** rather than adding one.
Two details follow, and both are in `runDispatchWave`:
the revive is guarded to race-loser rows only, so it agrees with the
candidate exclusion rather than relying on it; and the earlier telemetry
event is unbound from the offer, because `accept_job_offer()` marks
acceptance by `offer_id` and two events sharing one id would both be marked.

**How it was found.** The first test written for customer rejection. With two
providers in range, rejecting one produced zero offers and the second was
never asked. The pre-existing test for provider withdrawal asserted only that
the state machine *permits* the transition, never that re-dispatch reached
anyone — which is exactly how the bug shipped.
