# Assumption Register

Every uncertain assumption this implementation rests on. Status values:
**Validated** (checked against reality), **Needs validation** (plausible,
unverified), **Invalidated** (found to be wrong — with what changed).

If an assumption changes, the implementation and this file change together.

---

## A-001 — Browser heading is usable for route opportunity

**Assumption.** `GeolocationCoordinates.heading` gives a usable direction of
travel for a driving professional.

**Risk.** Route opportunity is the product's primary signal (§11). If heading
is usually absent, the calculator falls back to weaker evidence.

**Status: Partially invalidated — mitigated.**

Heading is `null` on most desktop browsers and on stationary devices, and is
only reliably populated while moving with GPS. Rather than trusting it
blindly, the calculator has three explicit bases and reports which one it
used:

| Basis | Evidence | Score ceiling |
|---|---|---|
| `destination_route` | A known destination, so the real detour is measured | 100 |
| `heading` | Direction inferred from a moving device | 78 |
| `proximity_only` | No direction data at all | 45 |

Heading is additionally ignored below `minSpeedForHeadingKmh` (8 km/h),
because a parked van's compass reading is not a direction of travel.

**Consequence.** The strongest signal comes from a known *destination*, not
from heading. The platform generates destinations itself: when a provider
goes `EN_ROUTE`, their customer's location is recorded as their destination,
so subsequent matching has real route data. Provider liquidity therefore
improves route-opportunity quality — see `docs/RISKS.md` R-004.

---

## A-002 — Threshold-rate commission is what was intended

**Assumption.** "up to ₪1,000 = 15%, above ₪1,000 = 10%" (§28) means the
whole amount is charged at the rate of the band it falls into, not that the
first ₪1,000 is charged at 15% and the remainder at 10%.

**Risk.** A ₪1,500 job yields ₪150 under the implemented reading and ₪200
under the progressive reading — a 33% revenue difference.

**Status: Needs validation (business decision).**

Implemented as a threshold rate, which is how the sentence reads and what a
provider quoted "10% above ₪1,000" would expect. The fee engine already
supports `percentage`, `fixed` and `tiered` shapes and reads them from the
`platform_fees` table, so switching to progressive tiers is a configuration
change plus one function branch, not a refactor.

---

## A-003 — Geometric ETA estimates are acceptable for ranking

**Assumption.** With no routing engine configured, `haversine × 1.35 ÷ 26 km/h
+ 3 min` ranks candidates acceptably.

**Risk.** Ranking quality, and customer trust if an ETA is badly wrong.

**Status: Needs validation against a real routing engine.**

Two guards are in place. Every figure carries a `confidence`
(`routed` | `estimated` | `unavailable`) that survives into the database and
the UI, so an approximation is never presented as a measurement; and the
customer-facing copy says "הערכה" rather than a promise. `MAP_PROVIDER=osrm`
switches to real road routing with no other change.

The 1.35 road factor and 26 km/h are dense-urban Tel Aviv guesses. They need
calibration against observed arrival times — which the schema already
collects (`provider_location_history`, `job_assignments.arrived_at`).

---

## A-004 — The route-opportunity weighting is correctly calibrated

**Assumption.** The §14 weights (route opportunity 25%, skill 20%,
availability 15%, ETA 10%, reliability 10%, rating 10%, price 5%,
experience 5%) make route opportunity decisive in practice.

**Risk.** This is the product thesis. If it is miscalibrated, GET SERVICE is
an ordinary distance-based marketplace with extra steps.

**Status: Needs validation with real data — and the margin is thin.**

Measured in the matching lab, in a deliberately adversarial scenario (the
wrong-way provider given a *better* rating, a *lower* price and *more*
experience):

| Provider | Distance | Direction | Final score |
|---|---|---|---|
| רם | 3.2 km | toward the customer, 0 min detour | **89.2** |
| דן | 1.0 km | away, 6.2 min detour | 89.0 |

Route opportunity wins — by **0.2 points**. It is decisive, but only just, and
the outcome is sensitive to the other signals.

One calibration flaw was already found and fixed this way: a linear
route-opportunity curve gave a 6.2-minute detour 75/100, so `isOnTheWay`
flipped at the threshold while the score barely moved. The curve is now
piecewise with a deliberate gap between the on-the-way band (85–100) and the
diverting band (≤70). See `docs/DECISIONS.md` D-004.

**What would validate this.** `matching_events` records every candidate's
signals, the weights used, and whether the offer was accepted and the job
completed. Once real volume exists, the question "would a different weighting
have produced more successful completions?" is answerable from stored data.

---

## A-005 — Customers will grant location permission

**Assumption.** Enough customers allow geolocation for the NOW flow to work.

**Risk.** Without a fix there is no matching, no ETA and no route opportunity.

**Status: Needs validation.**

No location is ever invented (§44). A denial produces an explicit state and a
request for an address, and the flow does not proceed with a fabricated
coordinate. Address-only geocoding is **not implemented** — a typed address
cannot currently substitute for a fix, which is the honest limitation rather
than a silent fallback.

---

## A-006 — The admin SVG map is sufficient for operations

**Assumption.** A relative-position plot is enough to run dispatch, without a
map tile vendor.

**Risk.** Operators may misread positions without streets for reference.

**Status: Accepted limitation, labelled in the UI.**

The map answers the operational questions — where is supply, where is demand,
which way is supply pointing, whose fix is stale — with no API key and no
external dependency. It is labelled in-product as a relative plot, not a
street map. A tile layer can be added behind the same component.

---

## A-007 — One application instance

**Assumption.** The MVP runs as a single process.

**Risk.** Rate limiting is per-process memory, and the realtime hub holds one
`LISTEN` connection per process.

**Status: True today, documented for scale.**

Rate limiting resets on restart and does not aggregate across instances
(`src/lib/rate-limit.ts` says so in the file). The realtime design is already
horizontal-safe: `LISTEN/NOTIFY` broadcasts to every listening process, so
each instance serves its own SSE clients correctly. Rate limiting is the part
that needs a shared store — see `docs/RISKS.md` R-008.

---

## A-008 — Deterministic keyword classification is adequate for the MVP

**Assumption.** Rule-based matching over Hebrew problem descriptions
classifies common requests well enough to dispatch on.

**Risk.** A misclassification sends the wrong trade.

**Status: Validated for the tested vocabulary; coverage is the open question.**

It is deterministic, instant, offline and explainable, and returns the terms
it matched. On the spec's own example — "יש מים שיוצאים מתחת לכיור" — it
returns `plumbing` / `sink_leak` / `high` at 0.94 confidence, matching §32.

Token-based phrase matching was necessary: naive substring matching failed
that exact example, because an intervening word breaks the literal phrase.

Two safety properties: the customer sees and can correct the classification
before committing, and low confidence produces a clarifying question instead
of a guess. The `UnderstandingAdapter` seam allows an AI classifier later,
with no path from it to authorization, payments or job state (§32).

---

## A-009 — Supabase compatibility is preserved without running on Supabase

**Assumption.** The migrations and RLS policies will work unchanged on a
Supabase project, despite being developed against local PostgreSQL.

**Risk.** A deployment-time surprise in the component the whole security model
rests on.

**Status: Structurally validated; not yet run against a live project.**

What makes this credible rather than hopeful: the application enforces RLS the
same way PostgREST does — `SET LOCAL ROLE authenticated` plus
`request.jwt.claims` — and `auth.uid()` is defined exactly as Supabase defines
it. The local shim (`db/local/0000_auth_shim.sql`) is skipped automatically
when the `auth` schema already exists, so the same migration run is a no-op
for it on Supabase. 25 security tests exercise the real policies through that
path.

Remaining risk is the surface *around* the policies: Supabase Auth issues its
own JWTs and manages `auth.users`, so registration/login would move to
Supabase Auth, and Storage would replace the (not yet implemented) local file
adapter.

---

## A-010 — `job_offers` never needs a second offer per provider per job

**Assumption.** `UNIQUE (job_id, provider_id)` is correct: a provider is
offered a given job at most once, ever.

**Risk.** If re-offering after a decline were wanted, this constraint blocks it.

**Status: Validated as intended behaviour.**

Re-pestering a provider who declined is bad for supply retention, and the
candidate finder already excludes anyone with an existing offer row, so wave
expansion reaches new providers rather than re-asking the same ones.
