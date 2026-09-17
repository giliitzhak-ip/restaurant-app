# QA

What is verified, how, and — importantly — what is **not**.

---

## Test inventory

204 tests, 22 files. Run: `npm test`
(first time: `npm run test:db` to create the test database).

### Unit — pure domain logic, no I/O

| File | Tests | Covers |
|---|---|---|
| `route-opportunity.test.ts` | 14 | Bearings, angular difference, the three evidence bases, score banding, the product thesis |
| `matching-engine.test.ts` | 14 | Ranking, weights, eligibility filters, breakdown arithmetic |
| `state-machine.test.ts` | 13 | Golden path, illegal jumps, actor permissions, terminal states |
| `fees.test.ts` | 11 | Tier boundaries, exact splits, bounds, category overrides |
| `understanding.test.ts` | 17 | Classification, determinism, specificity, urgency, empty input |
| `payments.test.ts` | 10 | Idempotency, over-capture, over-refund, declines |
| `availability-phrase.test.ts` | 7 | The one availability sentence a customer reads, including "busy now" vs "no availability" and the local day boundary |
| `foundation.test.ts` | 2 | Class merging |

### Integration — against a real PostgreSQL + PostGIS

| File | Tests | Covers |
|---|---|---|
| `dispatch.test.ts` | 10 | Candidate search, scoring, offers, wave expansion, exhaustion, telemetry, audit trail |
| `acceptance.test.ts` | 8 | Assignment, **the race**, expiry, competing-offer cancellation, one-job-at-a-time |
| `failure-scenarios.test.ts` | 12 | Every §44 failure mode |
| `state-machine.test.ts` | 4 | DB↔TypeScript parity across all 240 status pairs |
| `provider-onboarding.test.ts` | 7 | An unconfigured provider yields zero candidates; onboarded + verified yields one |
| `availability.test.ts` | 16 | The §52 case, the precedence order, job duration and fit, conflicts, temporary shifts and their expiry |
| `reject-match.test.ts` | 9 | Rejecting a match without abandoning the job; re-offering race losers; the cap; fairness to the rejected provider; telemetry counted once |
| `catalog-reachability.test.ts` | 4 | **Every trigger phrase resolves to the service that declares it**, in isolation and inside a sentence; the 16 canonical originals unmoved; no shipped service left unreachable |
| `trade-proposals.test.ts` | 10 | A pending proposal changes nothing; approval makes the trade both classifiable and dispatchable; built-in classifications undisturbed; approval without phrases refused; a provider cannot approve themselves or see another's proposal; duplicates refused; rejection recorded; no invented price |
| `sql-references.test.ts` | 1 | **Every relation named in every query under `src/` exists** |

### Security

| File | Tests | Covers |
|---|---|---|
| `rls.test.ts` | 17 | Cross-tenant reads, payout privacy, foreign offers, earnings tampering, role escalation, self-verification, audit forgery, review eligibility, location windows |
| `enforcement.test.ts` | 8 | **Proof the harness can fail** |
| `admin-audit.test.ts` | 5 | Audit append-only, no cross-admin forgery, change and record commit together |
| `grants.test.ts` | 5 | `service_role` reads every table; everything granted to `authenticated` has RLS on; `anon` reads the catalog and writes nothing; a non-admin cannot write settings or the catalog |

---

## The tests that matter most

### The race (§25)

Four providers accept the same job simultaneously, repeated five times.
Every time: exactly one winner, one `job_assignments` row, and the losers
receive `JOB_ALREADY_ASSIGNED`. Serialised by `SELECT … FOR UPDATE` on the job
with a `UNIQUE` constraint as an independent backstop.

### The harness self-check

Every "must see 0 rows" assertion would also pass if the harness were simply
broken. So `enforcement.test.ts` pins down the preconditions:

- `current_user` is `authenticated`, not a superuser, not `BYPASSRLS`
- `auth.uid()` resolves to the requested user inside the transaction
- a positive control returns rows, so an empty result means *refused*
- the row does exist for the owner when a user cannot see it
- JWT claims do not leak to the next user of a pooled connection
- every table has RLS enabled and at least one policy

**This exists because of a real bug.** An early harness set the claim outside
a transaction, where autocommit discarded it. `auth.uid()` was `NULL`, so
every negative test passed while testing nothing.

### State machine parity

All 16 × 15 ordered status pairs are checked against `can_transition()` in the
database, and every transition's actor permissions are compared field by
field. The TypeScript mirror cannot drift from the source of truth.

---

## Verified end to end over HTTP

Against the running app and a real database:

```
Customer login                                    → 200
POST /api/understand "יש לי נזילה מתחת לכיור"
  → plumbing / sink_leak / high / confidence 0.94   (matches §32 exactly)
POST /api/jobs                                    → SEARCHING, 4 offers in 5km

Offer ranking (real seeded data):
  יוסי לוי  85.9  on_the_way=true   1.10km   6min  ₪296
  רם אביטן  84.0  on_the_way=true   4.32km  13min  ₪290
  דן מזרחי  79.5  on_the_way=FALSE  1.35km   6min  ₪281   ← closer, ranked lower
  אבי שלום  75.6  on_the_way=true   3.99km  12min  ₪267

POST /api/offers/:id/accept   (provider)          → PROVIDER_SELECTED
POST transition CONFIRMED     (customer)          → CONFIRMED
POST transition EN_ROUTE → ARRIVED → IN_PROGRESS
     → AWAITING_CUSTOMER_CONFIRMATION (provider)
POST transition COMPLETED     (customer)          → COMPLETED
POST payment authorize                            → AUTHORIZED, ₪290, isRealPayment=false
POST payment capture                              → CAPTURED, fee ₪43.50 (15%), provider ₪246.50
POST payment capture (again)                      → CAPTURED, no double charge
POST review rating=5                              → REVIEWED
```

Audit timeline, with correct actor attribution throughout:

```
REQUESTED                                  [customer]
REQUESTED → SEARCHING                      [system]
SEARCHING → OFFERS_AVAILABLE               [system]
OFFERS_AVAILABLE → PROVIDER_SELECTED       [provider]
PROVIDER_SELECTED → CONFIRMED              [customer]
CONFIRMED → EN_ROUTE                       [provider]
EN_ROUTE → ARRIVED                         [provider]
ARRIVED → IN_PROGRESS                      [provider]
IN_PROGRESS → AWAITING_CUSTOMER_CONFIRM…   [provider]
AWAITING_CUSTOMER_CONFIRMATION → COMPLETED [customer]
COMPLETED → PAID                           [system]
PAID → REVIEWED                            [system]
```

Access control spot-checks: `/api/admin/overview` returns **403** for a
customer and **401** for an anonymous caller.

---

## UI audit

`npm run ui:audit` drives the real app in Chromium across six pages and
asserts what a screenshot cannot. Current result: **no issues**.

| Page | dir | lang | Overflow @390px | Console errors |
|---|---|---|---|---|
| Home | rtl | he | 0px | 0 |
| Login | rtl | he | 0px | 0 |
| Request | rtl | he | 0px | 0 |
| Provider | rtl | he | 0px | 0 |
| Admin (1440px) | rtl | he | 0px | 0 |
| Matching lab (1440px) | rtl | he | 0px | 0 |

It found and drove fixes for: four touch targets below 44px (example chips,
login link, category chips, footer link) and a missing favicon causing a 404.

---

## Adversarial probe against the running app

The §50 "break it" pass. Run against the live server with real sessions; no
new issues were found.

### Cross-tenant access

| Attempt | Result |
|---|---|
| Another customer reads the job | **404** — RLS makes it not exist |
| Anonymous reads the job | **401** |
| Another customer reads its timeline | **200 with 0 events** (owner sees 3) |
| Another customer transitions the job | **404** |
| Another customer pays for the job | **404** |
| Forged session cookie | **401**, `/api/auth/me` returns `null` |

The timeline case is the interesting one: the endpoint returns 200 because the
*query* is legal, but RLS filters every row. The owner sees 3 events and a
stranger sees 0 — filtered, not leaked.

### Privilege escalation

| Attempt | Result |
|---|---|
| Customer → admin overview / actions / matching debugger | **403** |
| Register with `role: "admin"` | **422** — not an accepted value |
| Customer → provider state / location endpoints | **403** |
| Customer forces `COMPLETED → PAID` | **403** — system-only transition |
| `COMPLETED → SEARCHING` | **409** — not a legal transition |

### Price tampering

The payment request was sent with `amount`, `grossAmount`, `platformFee` and
`providerAmount` all set to 1 agora. The server charged **₪296** — the price
the provider committed to. Client-supplied amounts are not read at all.

### Injection and malformed input

| Attempt | Result |
|---|---|
| `'; DROP TABLE jobs; --` in the description | 422 (unclassifiable), tables intact |
| `' OR 1=1 --` in the classifier | 200, treated as text |
| Non-UUID job id | 422 |
| Malformed JSON / empty body | 400 |
| Latitude 999 | 422 |
| Missing location | 422 — no invented coordinate |
| 10KB description | 422 |
| `SCHEDULE` with no time | 422 |
| `NOW` on a quote-only category | 422 — category config enforced |

Row counts after every attempt: `jobs=4 categories=7 providers=22` — unchanged.
All SQL is parameterised; the two dynamic identifiers in the codebase
(`setup-roles.mjs`, the assignment timestamp column) are validated against a
whitelist or a regex.

### Rate limiting and enumeration

Login attempts returned `401` then `429` after the configured threshold. An
unknown account and a wrong password return the **identical** response
(`INVALID_CREDENTIALS`, same message), so the endpoint cannot be used to
discover which addresses have accounts.

---

## Bugs found by testing, not by reading code

Listed because each one would have shipped:

1. **RLS policy infinite recursion.** The `jobs` policy queried `job_offers`,
   whose policy queried `jobs`. Every job read failed. Fixed with
   `SECURITY DEFINER` helpers (D-005).
2. **Vacuous security tests.** The JWT claim was set outside a transaction and
   discarded by autocommit, so `auth.uid()` was `NULL` and every negative test
   passed for free. Fixed, and `enforcement.test.ts` now prevents a recurrence.
3. **Route-opportunity miscalibration.** A linear curve let a 6.2-minute
   detour score 75/100 and beat a provider passing the door. Fixed with
   piecewise banding (D-004).
4. **Phantom route deviation.** The estimator added a 3-minute arrival
   overhead per leg, so splitting one trip into two manufactured 3 minutes of
   "deviation" for a provider driving straight through.
5. **Classifier phrase matching.** Substring matching failed the spec's own
   example, because "מים **שיוצאים** מתחת לכיור" does not contain the literal
   phrase. Fixed with token matching.
6. **Missing `anon` grants.** The public catalog was granted to
   `authenticated` only, so the home page and classifier failed for visitors.
7. **Silent degradation.** Worse than (6): the home page swallowed that error
   and rendered a healthy-looking page with no categories. Now logged.
8. **Enum vs LIKE.** `status like 'CANCELLED%'` against an enum column
   (42883). Found straight from the structured log line.
9. **Negative time-to-match.** Seed data back-dated `matched_at` while letting
   `created_at` default to `now()`. Real data cannot do that.
10. **Tests coupled to unrelated data.** Integration tests shared a database
    with development, where the demo seed puts 22 providers inside the tested
    radius. Seven tests' results depended on whether `db:seed` had run. Fixed
    with a dedicated test database (D-010).
11. **React correctness.** Refs mutated during render, `setState` called
    synchronously in effects, and `new Date()` during render — the last a real
    SSR hydration mismatch. Fixed with abort-flagged effects, which also
    removed a stale-response race.
12. **Provider registration was broken end to end.** `service_role` had only
    SELECT on `auth.users` in the local auth shim, so `POST /api/auth/register`
    could never insert and every signup returned 403. It went unnoticed
    because the earlier adversarial probe only tried `role: "admin"`, which is
    rejected at validation and never reaches the database — so no successful
    registration was ever exercised. Fixed by migration 0015, guarded to
    no-op on Supabase, where Supabase Auth owns that table.
13. **An admin action changed state, logged nothing, and reported failure.**
    `admin_actions` had a SELECT-only policy, and the audit INSERT ran in its
    own transaction. `verify_provider` committed the change, was denied the
    audit row by RLS, and returned 403 — the provider was verified, no trail
    existed, and the caller was told it had failed. Both halves were wrong:
    migration 0016 adds an INSERT policy (scoped to `admin_id = auth.uid()`,
    so one admin cannot forge another's action), and the handler now writes
    the audit row inside the same transaction as the change. An earlier commit
    message claimed this was already atomic; it was not.
14. **A registered provider could never be matched.** Registration created an
    account with no declared trade, and `find_candidate_providers` INNER JOINs
    `provider_categories` — so such a provider was not a weak candidate but
    absent from the search entirely, permanently. There was no screen or
    endpoint to declare a trade, prices or a service area. Built as
    `/provider/onboarding` plus `PUT /api/provider/setup`.
15. **ESLint 10 incompatibility.** `eslint-config-next@16` declares
    `eslint >= 9` but bundles a plugin using APIs removed in 10; every lint run
    crashed. Pinned to 9.39.5 (D-012).
16. **The realtime switch was broken outright.** Migration `0017` renamed
    `provider_availability` to `provider_status_history`; `/api/provider/state`
    kept writing the old name, so going online returned 500. Types, lint, build
    and 164 tests were green, because SQL in a template literal is just text.
    Now caught structurally by `sql-references.test.ts` (D-016), proven by
    reverting the fix.
17. **Every system read of the availability tables returned 42501,** which the
    API faithfully reports as `403 FORBIDDEN` — so the provider's own hours
    screen and the customer-facing profile both answered "no permission" on a
    request where permission was never the question. Migration `0017` granted
    those tables to `authenticated` only. Fixed by `0021`; the invariant is now
    asserted in `grants.test.ts` (D-017).
18. **The weekly plan vetoed the realtime switch.** A provider with normal
    weekday hours who tapped "accepting jobs" in the evening was shown as
    available and matched as unavailable, because a date override and an
    uncovered hour both came back as plain `false`. Migration `0022` (D-013).
    Without the fix, the two new quick actions would have done nothing at all
    outside planned hours.
19. **The UI audit passed dead pages.** Under `next dev` in this sandbox the
    HMR websocket cannot handshake, so Next never finished hydrating: handlers
    were dead and effects never ran. Clicking a login button fired no request.
    Every screenshot was of server-rendered HTML and every check passed on it.
    The audit now probes hydration directly and fails a page still loading
    (D-019). Found by clicking a button and watching nothing happen.
20. **A profile told a customer a lie.** The sheet read
    `אין זמינות בשבועיים הקרובים` about the provider who had just accepted that
    customer's own job. Every step of the computation was correct — `BUSY` is
    not available now, and a fortnight scan of an empty schedule finds nothing
    — and the sentence was false. Now `בעבודה כרגע`, with
    `לא פרסם שעות קבועות` kept distinct from "there is none"
    (`availability-phrase.test.ts`).
21. **Dead configuration posing as an explanation.**
    `availability.rules.noRulesMeansAlwaysPlanned` described behaviour nothing
    implemented, and a migration comment cited it as load-bearing. Removed by
    `0023` (D-015).
22. **Seeding was not idempotent.** `service_areas` and
    `provider_availability_rules` have no natural unique key, so a rerun
    without `--reset` silently doubled every schedule (4,914 → 9,828) while
    every other table upserted cleanly. Row counts still looked plausible, and
    validation passed because it counted providers. Two duplicate checks added;
    both fail on the corrupted data and pass after the fix.
23. **`--reset` could not run once a synthetic offer had been accepted.**
    `job_assignments.offer_id` references `job_offers` `ON DELETE RESTRICT` and
    the offers were deleted first. Reachable as soon as the demo simulator
    could accept. Fixed with the right order, and a refusal if any affected job
    belongs to a non-demo customer.
24. **Two `סגירה` controls for one action.** The sheet's backdrop was an
    `aria-label`led button behind the dialog, so a click on "the close button"
    hit the backdrop and was intercepted. Now `aria-hidden` and untabbable.
25. **Both re-dispatch paths were dead ends.** `find_candidate_providers`
    excluded any provider with any offer row for the job — and under
    first-accept-wins, `accept_job_offer()` cancels every competing offer the
    instant someone wins. So after a provider withdrew, or after the customer
    rejected a match, wave 1 skipped everyone who had merely lost by a second,
    which in a thin market is everyone, and the request died. Migration `0024`
    plus a guarded revive of the offer row (D-021). The pre-existing
    withdrawal test asserted only that the state machine *permits*
    `CANCELLED_BY_PROVIDER → SEARCHING`, never that re-dispatch reached
    anyone — which is exactly how it shipped. Found by the first test written
    for customer rejection.
26. **The trade-approval action could never succeed.** It inserted the
    provider's notification inside the admin's transaction, and
    `notifications` has no INSERT policy at all — a table users read and the
    system writes. The insert was refused and the whole approval rolled back.
    Found by running the action, not by reading it (D-023).
27. **`services.name_en` was NOT NULL,** so creating a service from a Hebrew
    trade name failed. The options were to invent a translation, to put the
    Hebrew string in an English column, or to admit the value is absent;
    migration 0026 makes it nullable. The structured log named the constraint
    immediately.
28. **A resolved proposal could not outlive its reviewer.**
    `reviewed_by ... on delete set null` contradicted a check constraint
    requiring a resolved row to have both `reviewed_by` and `reviewed_at`, so
    deleting an admin who had reviewed anything failed — and surfaced as an
    unrelated test-cleanup error. Migration 0027 keeps the invariant that
    matters (when it was resolved) and leaves who to `admin_actions`, which
    is the record of authority.
29. **A duplicate proposal was reported as a server fault.** The unique
    constraint refused it correctly and the API returned
    `INTERNAL_ERROR: משהו נכשל אצלנו` — untrue, and useless to someone who
    just submitted the same thing twice. `handleError` now maps 23505 by
    constraint name to a 409 with a specific message.
30. **Approved trades leaked between tests.** A service created by approving
    a proposal is not tied to a test user, so fixture cleanup left it behind —
    and it carries classifier phrases, so a leftover could change what an
    unrelated test's description classifies to. Cleanup now removes them.
31. **A revived offer would have counted its acceptance twice.**
    `accept_job_offer()` marks acceptance by `offer_id`, and reusing an offer
    row meant two `matching_events` rows shared that id, so both were marked
    accepted. The earlier event is now unbound when the offer is revived, and
    a test asserts exactly one accepted event per provider per job.

---

## Definition of done (§52)

| Gate | Status |
|---|---|
| Implemented | ✅ The §4 loop runs end to end |
| TypeScript passes | ✅ `tsc --noEmit` clean |
| Lint passes | ✅ `eslint .` clean |
| Unit tests pass | ✅ 81 |
| Integration tests pass | ✅ 41 against real PostgreSQL + PostGIS |
| Security verified | ✅ 30, plus a self-check proving they can fail |
| RLS verified | ✅ Enforced as `authenticated`; every table covered |
| UI inspected | ✅ `npm run ui:audit`, 6 pages, no issues |
| Mobile inspected | ✅ 390×844, no overflow, 44px targets |
| RTL inspected | ✅ `dir="rtl"`, LTR-isolated numerics |
| Loading state | ✅ Every async surface |
| Error state | ✅ Typed codes, retry, offline, unauthorized, expired |
| Empty state | ✅ No offers, no jobs, nobody found |
| Build passes | ✅ `next build` clean |

---

## Measured, at 1,022 providers

`find_candidate_providers()` against the seeded network (1,022 providers, 591
of them online and verified), on this machine:

| Radius | Execution | Rows |
|---|---|---|
| 5 km | 29 ms | 25 |
| 15 km | 29 ms | 50 (capped) |
| 50 km | 29 ms | 50 (capped) |

(Medians of three warm runs, re-measured after migration `0024` widened the
candidate predicate. The first call after a function is replaced costs ~400 ms
on a cold plan cache and is not representative.)

Flat across radius because the row cap bounds the work. This is after
migration `0019`, which reordered the filters so the cheap index-backed
predicates prune before the expensive availability function: the query
previously had a **fixed** cost regardless of results — 62 ms even when it
returned nothing — and measured 94 ms before the change against 17 ms after,
on the dataset of the day.

`provider_next_available_at()` costs ~10 ms per provider, worst case ~48 ms
for someone with no availability at all (a full 14-day scan in 30-minute
steps). It is called once per profile view, not per candidate.

Admin lists are capped (50 pending verifications, 200 live providers) and now
report the totals behind the cap, so a truncated queue says
`50 מתוך 137` rather than looking finished.

---

## Adversarial probe, second pass

Fourteen probes against the running production build, after this round's
changes. All behaved correctly:

| Probe | Result |
|---|---|
| Customer calls the provider availability API | `403 FORBIDDEN` |
| Anonymous reads a provider profile | `401 UNAUTHENTICATED` |
| Nonexistent / unverified provider id | `404 NOT_FOUND` |
| Non-UUID provider id | `422 VALIDATION_FAILED` |
| Window ending before it starts | `422 INVALID_WINDOW`, names the day |
| Weekday `9` | `422`, bounded by the schema |
| 200 windows (max 60) | `422`, bounded by the schema |
| `forMinutes` **and** `untilLocalTime` together | `422`, refinement fires |
| `forMinutes: 99999` | `422`, bounded |
| Customer sets provider state | `403 FORBIDDEN` |
| `bookingMode: COMPARE` | `422`, no longer an accepted value |
| Scheduled job in the past | `422 TIME_IN_PAST` |
| 65 profile reads in a row | 60 × `200`, then `429` |
| Demo tick auto-accept | accepted nothing it should not |

Two real findings, both fixed in the same pass:

* **The demo tick took no authentication.** `DEMO_MODE=true` was the only
  gate, so a deployment that shipped with it enabled would hand location
  mutation and — with `autoAcceptSynthetic` — assignment creation to anyone
  who found the URL. In production it now requires the shared
  `MAINTENANCE_TOKEN` as well, and refuses with `503` if that is unset.
* **The profile endpoint allowed enumeration.** Any signed-in account could
  walk every verified provider's prices and service list by id. Now rate
  limited per viewer at 60 per 5 minutes — well above a decision point, well
  below a scrape. Verified: 60 pass, the 61st is `429`.

---

## Not verified — honest gaps

These are stated rather than implied to work:

- **No real payment gateway.** The mock reports `isReal = false` and the UI
  says so. The production payment path is unproven beyond the interface.
- **Not run against a live Supabase project.** Compatibility is structural
  (A-009), not demonstrated.
- **No real routing engine exercised.** `OsrmMapProvider` is implemented and
  falls back correctly, but ETA accuracy against real roads is unmeasured
  (R-003).
- **No push notifications.** The biggest functional gap for a real launch
  (R-012).
- **No automated browser test of realtime reconnection** under network loss.
  The recovery path is the same code as the initial load, so it is exercised
  indirectly, but not as a disconnect scenario.
- **Rate limiting is per-process** and will not aggregate across instances
  (R-008).
- **No address geocoding.** A customer who denies location cannot proceed via
  a typed address; the flow says so instead of inventing a coordinate (A-005).
- **Spec §10's second branch is decided against, not missing.** The product
  owner confirmed first-accept-wins (D-020): offers go to several providers
  concurrently and the first to accept gets the job, so the customer sees one
  match rather than a shortlist. `GET /api/jobs/:id` deliberately does not
  return `job_offers` to them. Rejecting a match is its own action
  (`POST /api/jobs/:id/reject-match`), capped at three per job.
- **COMPARE is not built, and is refused rather than a dead end.** The
  booking mode was accepted and validated but nothing dispatched it, so a
  COMPARE job sat in `REQUESTED` forever. It is removed from the UI and from
  the API's accepted values (D-018). Quote comparison is now a decision
  against rather than an open question (D-020), so there is deliberately no
  customer-side offer-selection endpoint.
- **Client behaviour is verified in one environment.** Hydration, handlers and
  effects are driven against a local production build in Chromium. There is
  no device matrix, and iOS Safari differs on `100dvh`, safe-area insets and
  native date controls (R-014).
- **A rating aggregate without review rows.** Seeded providers carry
  `rating_avg`/`rating_count` with no `reviews` rows behind them, so the
  profile shows the aggregate and `ratingBreakdown: null` rather than a
  fabricated distribution (A-013, SEED_DATA.md).
- **`provider_next_available_at()` scans in 30-minute steps** while the hours
  editor offers quarter-hours, so an 08:15 shift can be reported as free from
  08:30 — late, never early (A-012).
- **The demo simulator can accept on a synthetic provider's behalf.** Four
  guards, and it goes through `accept_job_offer()` rather than writing rows,
  but it is a path that manufactures a commitment (R-016).
- **Provider documents are not uploadable.** Categories declare
  `requires_license` / `requires_insurance` / `requires_documents`, and
  onboarding tells the provider an admin will ask for them, but there is no
  upload surface and no storage adapter behind `provider_documents`.
- **No load testing.** Index choices are reasoned, and the candidate query is
  measured at 1,022 providers (below), but there is no concurrency or
  sustained-throughput test.
- **`npm audit` not run** as part of the gates.

---

## Reproducing

```bash
npm install
npm run db:roles        # create app + anon/authenticated/service_role
npm run db:setup        # migrate and seed development
npm run test:db         # create the dedicated test database
npm test                # 152 tests

npm start &
SHOTS=./.ui-shots npm run ui:audit
```

Demo accounts (password `demo1234`): `rotem@demo.local` (customer),
`ram-on-the-way@demo.local` (provider), `admin@demo.local` (admin).

Demo fixes go stale after 120s by design, because the matcher refuses stale
locations. `npm run demo:tick` moves the demo fleet and refreshes it, which is
what makes a live demo behave like a live network.


---

## The clock, the limits, the papers and the photos

A pass over everything the product promised and did not do. Each of these was
found by looking for the gap between what a screen or a schema says and what
the code does, which is the same method that found the licence problem.

| Found | How | Fix |
|---|---|---|
| Nothing called the maintenance tick, so offers never expired and jobs never escalated | Reading the endpoint's own comment ("safe to call from a cron") and then looking for the cron | In-process scheduler; the first tick expired 7 stale offers |
| `MAINTENANCE_INTERVAL_SECONDS=""` silently disabled the clock | A unit test for the parser | Empty is absent; only an explicit 0 stops it |
| Rate limits reset on restart and multiplied per instance | Restarting the server mid-window | Postgres-backed counter, one atomic statement |
| The document gate never looked at a document again after approval | Asking what happens the day a licence expires | Expiry sweep; the provider goes back to PENDING and is told why |
| `job_images` had no writer while `requires_before_after` was sent to both screens | Grepping for writers of every table | Photo upload, and completion refuses without them |
| An uploaded document was stored with an empty `storage_path` and could never be read | A test that asserted the path | Id and locator decided before the INSERT |
| `expires_on` came back as `"2028-06-30T00:00:00.000Z"` | Reading the rendered screen, not the API | Returned as text |
| A wrong verification code cost nothing, because the attempt counter rolled back with the failure | A test that asserted the counter | Counted in its own transaction |
| A code sent to one number verified whichever number was on the profile at confirm time | Writing the attack down as a test | Verified against the recorded destination |
| Seeded ratings had no review rows behind them | The score's own deduction (A-013) | Capped counts, real history, derived aggregates |
| A rerun left 91 profiles claiming up to 1,964 reviews | Running the seeder twice | Derive for every synthetic provider, not only those with history |
| Every top-tier provider drew 24 five-star reviews | Looking at the resulting distribution | Two-point draw with a tail |
| The availability editor overflowed 320px by 39px | Widening the UI audit to four widths | The date range stacks below 360px |
| The UI audit could not find Chromium and exited | Running it | Resolves whatever build is on disk |

Two of these — the clock and the rate limiter — were "documented limitations"
before they were bugs. A hole with a paragraph next to it is still a hole; the
paragraph only means nobody can be surprised by it.
