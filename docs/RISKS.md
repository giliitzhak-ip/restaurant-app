# Risk Register

Probability and impact are judgements for the MVP stage. Each risk names how
it is mitigated *today* and how it can be *verified*, so nothing here relies
on an untested claim.

---

## R-001 — The matching thesis is not robustly calibrated

| | |
|---|---|
| **Probability** | High |
| **Impact** | Critical — it is the product |

Route opportunity wins the adversarial comparison by only **0.2 points**
(89.2 vs 89.0) when the wrong-way provider has a better rating, lower price
and more experience. The thesis holds at the §14 weights but is sensitive to
them.

**Mitigation.** Weights live in the `settings` table, editable by an admin and
versioned in `admin_actions`. Scoring is piecewise so the on-the-way band
cannot overlap the diverting band (D-004). `/matching-lab` runs the real
engine so any weighting change can be checked before it ships.

**Verification.** `matching_events` stores every candidate's signals, the
weights used, acceptance and outcome. Once real volume exists, ask directly:
would another weighting have produced more successful completions? Until then
this is explicitly unvalidated (A-004).

---

## R-002 — Heading data is often missing, weakening route opportunity

| | |
|---|---|
| **Probability** | High |
| **Impact** | High |

Browsers report `heading: null` when stationary and on most desktops.

**Mitigation.** Three explicit evidence bases with different score ceilings,
and heading ignored below 8 km/h. The platform manufactures its own strongest
signal: going `EN_ROUTE` records the customer as the provider's destination,
so route deviation becomes *measurable* rather than inferred.

**Verification.** `matching_events.provider_heading_deg` and the
`route_opportunity_score` basis are recorded per candidate; the share of
`destination_route` versus `heading` versus `proximity_only` decisions is a
direct query.

---

## R-003 — ETAs are estimated, not routed

| | |
|---|---|
| **Probability** | Certain in the default configuration |
| **Impact** | Medium — trust and expectation setting |

The default map provider is a geometric approximation, not routing.

**Mitigation.** Every figure carries a `confidence` that survives into the
database and the UI; estimates are shown as estimates ("הערכה"), never as
promises. `MAP_PROVIDER=osrm` switches to real routing with no code change.
A routing failure falls back safely and stays labelled `estimated`, never
`routed`.

**Verification.** `tests/integration/failure-scenarios.test.ts` asserts that a
dead routing provider yields `etaMinutes = null` and
`eta_confidence = 'unavailable'` — no invented number — and that estimated
ETAs are never stored as `routed`. Accuracy itself is measurable once
`arrived_at` data accumulates.

---

## R-004 — Provider liquidity

| | |
|---|---|
| **Probability** | High at launch |
| **Impact** | Critical |

With few online providers, dispatch exhausts its waves and the customer gets
nothing. Worse, route opportunity degrades: fewer providers means fewer known
destinations means weaker signals.

**Mitigation.** Waves expand 5 → 10 → 20 km before giving up. Exhaustion is
honest — the job is cancelled with a clear message and a retry, not left
spinning. `unmatched_rate` is a first-class metric on the admin dashboard.

**Verification.** `unmatched_jobs`, `unmatched_rate_pct` and `match_rate_pct`
in the control tower; a dispatch test asserts the exhaustion path reaches
`CANCELLED_BY_SYSTEM`.

---

## R-005 — Two providers accepting the same job

| | |
|---|---|
| **Probability** | Certain at volume |
| **Impact** | Critical — double-booking destroys trust on both sides |

**Mitigation.** Acceptance happens entirely inside `accept_job_offer()`:
`SELECT … FROM jobs … FOR UPDATE` serialises contenders, and
`UNIQUE (job_id)` on `job_assignments` is an independent backstop. The loser
receives `JOB_ALREADY_ASSIGNED`, mapped to a clean 409 and a plain message.

**Verification.** Proven, not assumed: a 4-way concurrent accept repeated five
times yields exactly one winner every time, with the losers receiving the
specific error. `tests/integration/acceptance.test.ts`.

---

## R-006 — RLS misconfiguration

| | |
|---|---|
| **Probability** | Medium |
| **Impact** | Critical |

53 policies across 31 tables is a lot of surface.

**Mitigation.** Default deny: RLS on every user-exposed table, so a missing
policy denies rather than exposes. Sensitive columns are in separate tables
because RLS is row-level, not column-level — payout details would otherwise be
readable by anyone allowed to see a provider's rating.

**Verification.** 25 security tests through the real restricted connection,
plus a self-check suite that pins `current_user` to `authenticated`, asserts
`auth.uid()` resolves, keeps a positive control, and proves JWT claims do not
leak across pooled connections. Two further tests assert that *every* table
has RLS enabled and at least one policy, so a new table cannot be added
unprotected without a test failing.

**Known near-miss.** An early harness set the JWT claim outside a
transaction, where autocommit discarded it; `auth.uid()` was `NULL` and every
negative test passed vacuously. The self-check suite exists because of it.

---

## R-007 — Realtime disconnection

| | |
|---|---|
| **Probability** | High (mobile networks) |
| **Impact** | Low, by design |

**Mitigation.** Events carry identifiers only, so a client that missed some
just refetches and is immediately correct. `EventSource` reconnects on its
own, the server re-sends `ready` on reconnect to trigger a fresh authoritative
read, the hub reconnects to Postgres with capped exponential backoff, and
polling continues regardless. The UI states the connection status rather than
silently showing stale data.

**Verification.** The recovery path is the *same* code path as the initial
load, so it is exercised by every test and every page load. End-to-end
reconnection under real network loss is not automated — an honest gap.

---

## R-008 — Rate limiting is per-process

| | |
|---|---|
| **Probability** | Certain once horizontally scaled |
| **Impact** | Medium |

`src/lib/rate-limit.ts` is in-memory: limits reset on restart and do not
aggregate across instances.

**Mitigation.** Stated in the file itself and in A-007, not hidden. Login is
additionally protected by a generic error that prevents account enumeration,
and scrypt makes brute force expensive.

**Verification.** Needs a shared store (Redis or a Postgres table) before
running more than one instance. Not implemented.

---

## R-009 — Payment integration is unproven

| | |
|---|---|
| **Probability** | Certain |
| **Impact** | High for launch |

No real gateway is integrated.

**Mitigation.** The adapter boundary is defined and the mock is a faithful
implementation of it (idempotency, over-capture and over-refund rejection,
deterministic failure). `isReal = false` propagates to the UI, which labels
test payments as such, and production startup refuses a non-real adapter.
A failed capture leaves the job `COMPLETED`, never `PAID`.

**Verification.** 11 payment tests including idempotent replay and failure
paths; a failure-scenario test asserts a declined authorization cannot lead to
`PAID`. The real gateway remains unverified — stated plainly.

---

## R-010 — Cancellation abuse

| | |
|---|---|
| **Probability** | Medium |
| **Impact** | Medium |

Either side can cancel repeatedly to game the system.

**Mitigation.** Every cancellation is recorded with actor, reason and
timestamp; `cancelled_jobs` counters feed the reliability score, so a
frequently-cancelling provider is ranked down automatically. Provider
cancellation returns the job to matching rather than stranding the customer.

**Verification.** Reliability scoring is unit-tested. No cancellation-fee or
suspension policy is implemented — deliberately out of MVP scope.

---

## R-011 — Off-platform leakage

| | |
|---|---|
| **Probability** | High in this market |
| **Impact** | Medium-to-high on revenue |

Customer and provider exchange numbers and settle the next job directly.

**Mitigation.** Partial by design. The provider sees the customer's phone only
once assigned, and the exact address only after acceptance. Nothing stronger
is implemented.

**Verification.** `repeat_customer_rate` is in the §37 metric list;
divergence between repeat customers and repeat *platform* jobs is the signal.
Not yet instrumented.

---

## R-012 — Notification delivery

| | |
|---|---|
| **Probability** | High |
| **Impact** | High — an unseen offer is a lost job |

Offers currently surface via SSE and in-app rows only. There is no push, SMS
or email.

**Mitigation.** Offers expire and dispatch escalates to the next wave, so an
unseen offer delays rather than kills the job. `notifications` rows persist so
nothing is lost if a client is closed.

**Verification.** `provider_response_time` and `acceptance_rate` in the
control tower. Push delivery is not implemented — the largest functional gap
for a real launch.

---

## R-013 — Location privacy

| | |
|---|---|
| **Probability** | Medium |
| **Impact** | High (regulatory and trust) |

Continuous tracking of working professionals is sensitive personal data.

**Mitigation.** Tracked only as precisely as necessary (§17): nothing while
`OFFLINE` — going offline deletes the stored position — sparse while `ONLINE`,
frequent only while `EN_ROUTE`. History is appended only during an active job,
not while idle. A customer may read a provider's position only while their own
job is genuinely in flight, enforced by RLS, and `recorded_at` is set by the
server so a client cannot forge freshness.

**Verification.** Three security tests: a customer cannot see a provider's
location before the job is in flight, can once it is, and a stranger never
can. Retention limits and a deletion policy are not implemented.
