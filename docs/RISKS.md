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

---

## R-014 — Client-side behaviour is verified in one environment only

**Risk.** Hydration, event handlers and client effects are exercised against
a local production build driven by Chromium. There is no matrix of real
devices, and iOS Safari in particular differs on `100dvh`, `env(safe-area-*)`
and native date/time controls.

**Why it matters.** The whole provider console is client-driven. A hydration
failure looks like a frozen loading state — which is exactly the failure that
went unnoticed under `next dev` until the audit was taught to detect it.

**Mitigation now.** `scripts/ui-audit.mjs` asserts hydration directly and
fails any page still showing a loading label, so the failure mode is loud
rather than silent. The journey is driven end to end, not screenshotted.

**What would reduce it.** A device matrix in CI, and a synthetic check that
loads the provider console on a real handset and asserts the switch toggles.

## R-015 — Two sources of truth for an expired shift

**Risk.** `online_until` is enforced in `provider_is_available_at()` and
reconciled by `expire_online_windows()`. If the maintenance tick stops
running, matching stays correct but the provider's screen, the admin tower
and the status history keep saying `ONLINE`.

**Why it matters.** A provider seeing "accepting jobs" while receiving nothing
will conclude the platform is broken, and support has no way to tell the
difference from the UI.

**Mitigation now.** The important direction is safe — matching never
over-offers — and the divergence is asserted in a test, so the behaviour is
deliberate rather than discovered.

**What would reduce it.** Surface `online_until` on the provider's own screen
as a countdown (partially done: the screen explains that the shift will end
automatically), and alert in the admin tower when the tick has not run.

## R-016 — The demo simulator can accept work on a provider's behalf

**Risk.** `POST /api/demo/tick` with `autoAcceptSynthetic: true` creates real
assignments by calling `accept_job_offer()` as a synthetic provider.

**Why it matters.** An acceptance is a commitment. A path that manufactures
one, if it ever escaped its guards, would put jobs against providers who never
agreed.

**Mitigation now.** Four independent conditions, all required:
`DEMO_MODE=true`; the flag is off by default; the provider must be
`@synthetic.local` **and** `is_demo`; the job's **customer** must be
`is_demo`. It goes through `accept_job_offer()` rather than writing rows, so
the single-winner transaction, the state machine and the audit trail all
apply, and it cannot produce an assignment the real flow could not. It is
capped per tick.

**What would reduce it.** Move the simulator out of the application entirely,
into a script that can only be run against a non-production database.

## R-017 — Seed reruns and demo ticks interact with validation

**Risk.** The demo tick refreshes every demo location, which removes the stale
fixes the generated network deliberately contains; `npm run db:validate` then
fails a coverage check that was passing.

**Why it matters.** A validator that fails for a legitimate reason teaches
people to ignore it, which is how a real failure gets waved through.

**Mitigation now.** That check prints why it failed and what to do
(`re-seed before validating`), and the ordering constraint is documented in
[SEED_DATA.md](SEED_DATA.md). Seeding itself is now idempotent — a rerun
without `--reset` used to double every schedule silently, and two new
duplicate checks would now catch it.

**What would reduce it.** Tag the generated stale fixes explicitly, so the
check can assert the *intent* survived rather than the current timestamps.

---

## R-018 — The catalog grows by human review, and reviews are a bottleneck

**Risk.** Every provider-proposed trade waits on one person. A provider
cannot earn in that trade until it is resolved, and there is no SLA, no
reminder and no escalation.

**Why it matters.** The people most likely to propose a trade are the ones
the catalog serves worst, so a slow queue falls hardest on exactly the
providers the feature exists for. A week of silence reads as rejection.

**Mitigation now.** The queue is FIFO and surfaced on the admin home with its
total, so a truncated list cannot look finished. At most 5 pending per
provider keeps one account from burying the rest. The provider sees their
own status at all times and is told plainly that nothing will arrive until
approval.

**What would reduce it.** An age indicator on the queue and an alert past a
threshold; and auto-approval for a proposal whose phrases already
overwhelmingly match an existing service, which is a merge rather than a new
trade.

## R-019 — Approved phrases can capture descriptions they should not

**Risk.** A reviewer types a broad phrase — "מים", "חשמל" — and that service
starts winning classifications away from the curated ones. The classifier
scores by phrase specificity, so a broad single-word phrase is weak, but a
broad multi-word phrase is not.

**Why it matters.** A misrouted job reaches providers of the wrong trade,
which wastes the customer's time and the providers' attention, and the cause
is invisible from the customer's side.

**Mitigation now.** The merge is additive, so built-in rules still compete
rather than being replaced, and scoring favours the more specific phrase. A
test asserts the four canonical descriptions are unchanged after an approval.
Every approval is audited with the exact phrases, so a bad one is traceable
to a decision.

**What would reduce it.** Show the reviewer, before they approve, which
existing descriptions their phrases would newly capture — the matching lab
already has the machinery to answer that.

## R-020 — Notification delivery is real machinery behind a stand-in adapter

**What could go wrong.** The outbox, the retry, the backoff and the abandon
path all work; the adapter at the end of them writes a log line and reaches
nobody. `assertNotifierIsSafe` refuses to boot in production without
`DEMO_MODE=true`, so this cannot ship silently — but in a demo it means a
provider still only learns about an offer if the tab is open.

**Why it is ranked here.** Unlike a failed payment, an undelivered
notification produces no complaint. Customers wait, providers never answer,
and the dashboard shows a marketplace with no liquidity rather than a
marketplace with no notifications.

**What would close it.** A real push and SMS gateway registered in
`getNotifier()`. Nothing else changes: the interface, the outbox and the
retries are already exercised by seven integration tests using a scripted
adapter.

## R-021 — One browser engine, four widths

**What could go wrong.** The UI audit now runs at 320, 390, 768 and 1440 px
and it found a 39px overflow in the availability editor on its first run — but
it is still Chromium. iOS Safari is the single largest share of this
product's likely traffic and it is untested: `100vh`, date inputs, `sticky`
and the file picker all behave differently there.

**What would close it.** A device matrix in CI against a real iOS Safari, or
at least a WebKit run. Neither is available in this environment, which is why
this is written down rather than implied to be covered.
