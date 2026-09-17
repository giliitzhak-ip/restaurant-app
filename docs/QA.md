# QA

What is verified, how, and — importantly — what is **not**.

---

## Test inventory

152 tests, 15 files. Run: `npm test`
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
| `foundation.test.ts` | 2 | Class merging |

### Integration — against a real PostgreSQL + PostGIS

| File | Tests | Covers |
|---|---|---|
| `dispatch.test.ts` | 10 | Candidate search, scoring, offers, wave expansion, exhaustion, telemetry, audit trail |
| `acceptance.test.ts` | 8 | Assignment, **the race**, expiry, competing-offer cancellation, one-job-at-a-time |
| `failure-scenarios.test.ts` | 12 | Every §44 failure mode |
| `state-machine.test.ts` | 4 | DB↔TypeScript parity across all 240 status pairs |
| `provider-onboarding.test.ts` | 7 | An unconfigured provider yields zero candidates; onboarded + verified yields one |

### Security

| File | Tests | Covers |
|---|---|---|
| `rls.test.ts` | 17 | Cross-tenant reads, payout privacy, foreign offers, earnings tampering, role escalation, self-verification, audit forgery, review eligibility, location windows |
| `enforcement.test.ts` | 8 | **Proof the harness can fail** |
| `admin-audit.test.ts` | 5 | Audit append-only, no cross-admin forgery, change and record commit together |

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
- **Spec §10's second branch is not implemented.** One excellent match gets a
  single recommendation, which is built. "Several genuinely different options
  → show at most three" is not: the customer never sees the offer list, and
  `GET /api/jobs/:id` does not return `job_offers` to them.
- **COMPARE is a dead end.** The booking mode is accepted and validated, but
  only `NOW` dispatches, so a COMPARE job is created and nothing further
  happens. There is also no customer-side offer-selection endpoint — only the
  provider's `accept`/`decline`. Choosing between the quote model and the
  pick-a-candidate model is a product decision with different schema
  consequences, so it is left open rather than guessed at.
- **Provider documents are not uploadable.** Categories declare
  `requires_license` / `requires_insurance` / `requires_documents`, and
  onboarding tells the provider an admin will ask for them, but there is no
  upload surface and no storage adapter behind `provider_documents`.
- **No load testing.** Index choices are reasoned, not benchmarked.
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
