# Architecture

## The one idea that shapes everything

> The database is the source of truth. Realtime is a synchronisation
> mechanism. The frontend is presentation.

Every structural decision follows from that. Authorization is in the
database, not in route handlers. Job state transitions are validated by a
trigger, not by the caller. Realtime carries identifiers so clients must
re-read through RLS. Prices come from the provider's committed rate, never
from a request body.

---

## Layers

```
Browser (React 19, RTL, mobile-first)
   │  fetch + EventSource
   ▼
Next.js route handlers ── validate (Zod) · resolve session · map errors
   │
   ├── withUser(userId)   → SET LOCAL ROLE authenticated + request.jwt.claims
   │                        RLS ENFORCED — everything user-facing
   └── withSystem()       → SET LOCAL ROLE service_role (BYPASSRLS)
                            dispatch, matching, payment capture only
   │
   ▼
Domain layer (pure: no React, no SQL, no I/O except through interfaces)
   matching/ · jobs/ · payments/ · geo/ · notifications/
   │
   ▼
PostgreSQL 16 + PostGIS 3.4
   53 RLS policies · state machine as data · transactional acceptance
   spatial indexes · audit triggers · LISTEN/NOTIFY
```

The domain layer imports nothing from `next`, `react` or `pg`. That is what
makes the matching engine unit-testable and what stops business logic leaking
into components (§13, §48).

---

## Directory map

```
src/
  app/                     Next.js App Router
    page.tsx               Customer home — one question, one input
    request/               Describe → classify → locate → create
    jobs/[id]/             Live job: searching → match → track → pay → review
    provider/              Provider console (minimal taps)
    admin/                 Control tower + matching debugger
    matching-lab/          Algorithm simulator
    api/                   Route handlers
  components/ui/           Primitives (shadcn/ui idiom)
  domains/
    geo/                   MapProvider interface, OSRM + estimator, math
    matching/              engine · route-opportunity · scorers · dispatch · config
    jobs/                  state-machine · understanding
    payments/              provider interface · mock adapter · fees
    notifications/         realtime transport
  lib/                     db · auth · api · settings · logger · rate-limit
db/
  migrations/              0001–0014, append-only
  local/                   Supabase auth shim (skipped on Supabase)
scripts/                   setup-roles · migrate · seed · setup-test-db
tests/                     unit · integration · security
legacy-restaurant/         Preserved prior app (excluded from build)
```

---

## The matching pipeline

```
find_candidate_providers()        SQL + PostGIS
  ├─ category match
  ├─ verification = VERIFIED
  ├─ state = ONLINE
  ├─ recorded_at > now() - staleness   ← a stale fix is never "live"
  ├─ ST_DWithin(wave radius) AND ST_DWithin(provider's own radius)
  ├─ no existing offer for this job
  └─ not already engaged on another job
        │
        ▼
MatchingEngine.match()            TypeScript, pure
  ├─ hard filters (stale, imprecise, out of radius, not ONLINE)
  ├─ RouteOpportunityCalculator   ← the differentiator
  ├─ ETA via MapProvider
  ├─ skill · availability · reliability · rating · price · experience
  └─ RankingEngine (weighted sum; ties break to on-the-way, then sooner ETA)
        │
        ▼
DispatchManager
  ├─ drop anything below minScoreToOffer
  ├─ take top N for this wave
  ├─ create job_offers with a TTL
  ├─ record matching_events for EVERY candidate, including exclusions
  └─ SEARCHING → OFFERS_AVAILABLE (only if offers actually went out)
```

Scoring happens in TypeScript rather than SQL deliberately: it is where the
logic is testable, explainable and configurable. SQL does what SQL is good at
— spatial filtering and set reduction.

### Route opportunity

Three evidence bases, never conflated:

| Basis | When | Score band |
|---|---|---|
| `destination_route` | Destination known → real detour measured | 85–100 on the way, ≤70 diverting |
| `heading` | Moving device reports a bearing → inferred | ≤78 |
| `proximity_only` | No direction data | ≤45 |

Straight-line distance is never the only signal (§11). When there is no
directional evidence at all, the calculator says so via `basis` instead of
implying a route judgement.

---

## Security model

| Concern | Where it is enforced |
|---|---|
| Row visibility | RLS policies, evaluated as `authenticated` |
| Role escalation | `guard_profile_role()` trigger |
| Self-verification | `guard_provider_verification()` trigger |
| Job transitions | `enforce_job_transition()` trigger + `job_transitions` table |
| Double assignment | `FOR UPDATE` + `UNIQUE (job_id)` |
| Audit integrity | Trigger-written; users have no INSERT on `job_status_history` |
| Payment amounts | Server-read from `job_assignments.price_ils` |
| Payment replay | `UNIQUE (idempotency_key)` on `payment_transactions` |
| Document privacy | RLS + storage boundary (signed URLs) |
| Matching internals | `settings` and `matching_events` are admin-only |

Route handlers still check `requireRole()` — but as a convenience for clean
error messages, not as the boundary. The layering is deliberate: a mistake in
a handler degrades the error message, not the isolation.

### Policy recursion

A policy on `jobs` must not query `job_offers`, because that table's policy
queries `jobs` — PostgreSQL detects the cycle and fails the query. Every
cross-table lookup inside a policy therefore goes through a narrow
`SECURITY DEFINER` helper (D-005).

---

## Data flow for one request

"יש לי נזילה" → matched professional:

1. `POST /api/understand` — classify (read-only, `anon`).
2. `POST /api/jobs` — validate; classify server-side; resolve category and
   service against the catalog; check the category supports this booking mode;
   INSERT **as the customer** so the RLS insert policy applies.
3. `withSystem` moves `REQUESTED → SEARCHING` (audited as `system`).
4. `runDispatchWave` — candidates, scoring, offers, telemetry, notifications.
5. `NOTIFY` → SSE → each client refetches through RLS.
6. Provider `POST /api/offers/:id/accept` → `accept_job_offer()`, one winner.
7. Customer `PROVIDER_SELECTED → CONFIRMED`; provider walks `EN_ROUTE →
   ARRIVED → IN_PROGRESS → AWAITING_CUSTOMER_CONFIRMATION`.
8. Customer confirms → `COMPLETED`; payment authorize + capture → `PAID`
   (system only, and only on a successful capture); review → `REVIEWED`.

Every step appends to `job_status_history` with actor and reason.

---

## Vendor boundaries

| Interface | Implementations | Swap cost |
|---|---|---|
| `MapProvider` | `OsrmMapProvider`, `EstimateMapProvider` | One class |
| `PaymentProvider` | `MockPaymentProvider` | One class |
| `RealtimeTransport` | Postgres LISTEN/NOTIFY | One class |
| `UnderstandingAdapter` | `RuleBasedUnderstanding` | One class |

Nothing above these interfaces knows which implementation answered. Results
carry a `confidence` or an `isReal` flag where honesty about the
implementation matters to the user.

---

## Configuration, not code

These are rows, not constants: matching weights, dispatch waves and radii,
offer TTL, staleness and accuracy thresholds, location-reporting intervals,
lifecycle timeouts, commission model, and every category's behaviour flags
(`supports_now`, `requires_license`, `default_radius_km`, …).

Adding a category is an INSERT. No application branch changes (§5).
