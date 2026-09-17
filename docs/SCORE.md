# Self-assessment against the §68 rubric

Scored against the brief's own 100-point rubric, with evidence. The rule from
§72 applies throughout: **unverified is unverified**. Where something works
but has not been demonstrated, it is scored as not demonstrated.

Run everything in [Reproducing](QA.md#reproducing) before trusting any number
here.

**Changed since this was first scored.** Criterion 1 kept its 10, but it was
awarded while the customer still had no way to turn down a match without
cancelling the whole request — a product-clarity defect that only became
visible once the multi-offer model was settled as first-accept-wins (D-020).
It is fixed, so the 10 stands; it did not stand at the time it was written.

| # | Criterion | Max | Score | Evidence, and what is missing |
|---|---|---|---|---|
| 1 | Product clarity — one question, no obstacles | 10 | **10** | Home asks *what* and *when*, then one button. Category grid, radius, rating and price filters, and two of three CTAs deleted (UX_PRINCIPLES 1–2). Rejecting a match is its own action rather than a cancellation (D-020). |
| 2 | Route opportunity is the primary signal | 10 | **9** | 25% weight, three evidence bases, piecewise banding. Proven on live data: רם at 4.32 km outranks דן at 1.35 km. **−1:** the adversarial margin is 0.2 points (A-004, R-001) — correct, but thin. |
| 3 | Availability: realtime **and** planned | 10 | **10** | Both, with a documented precedence and 16 integration tests. The §52 property holds: changing the requested time flips eligibility. |
| 4 | Matching engine — configurable, inspectable | 10 | **9** | Nine-stage pipeline, Zod-validated weights summing to 1.0, per-candidate breakdown, `/matching-lab`, a per-job debugger. **−1:** weights are editable only through the settings API, not a UI. |
| 5 | State machine — server-authoritative | 10 | **10** | `job_transitions` as data, a `BEFORE UPDATE` trigger, a TS mirror asserted against all 240 status pairs. |
| 6 | Security — RLS, transactional acceptance | 10 | **10** | 53 policies, tested through the real PostgREST contract; 27 security tests including 8 that prove the harness can fail. Acceptance is `FOR UPDATE` + `UNIQUE(job_id)`. |
| 7 | Honesty — no fake functionality | 10 | **9** | Mock payments report `isReal: false`; no invented locations, ETAs or route claims; stale GPS drops out of matching; `COMPARE` refused rather than dead-ended. **−1:** seeded rating aggregates have no review rows behind them (A-013) — disclosed in the API and the UI, but still a number without its detail. |
| 8 | Visual and UX craft | 10 | **8** | One dark identity, 18/18 measured contrast, RTL asserted, 44px targets, motion that explains. **−2:** one environment only (Chromium at 390px and 1440px); no device matrix, and iOS Safari is untested (R-014). |
| 9 | Seed realism at scale | 10 | **10** | 1,000 deterministic providers across 32 weighted regions; ratings generated with their counts; 32 validation checks; environment-guarded; idempotent. |
| 10 | Testing and verification discipline | 10 | **9** | 181 tests / 19 files; every bug in QA.md was found by running the system. Two structural guards added for classes of bug that types and lint cannot see. **−1:** no load or concurrency test, and no CI. |

**Total: 94 / 100.**

## Why this is not ≥ 95

The brief asks for ≥ 95 with no critical gate failure. There is no critical
gate failure — every gate is green, and the honest gaps are named rather than
hidden. But three deductions are real and I am not going to argue them away:

1. **Client behaviour is verified in one browser, at two viewports.** This is
   the largest single gap. The provider console is entirely client-driven, and
   the failure mode is silent: a page frozen in its loading state looks
   plausible. That exact failure went unnoticed for an entire session because
   the UI audit was screenshotting a dev server that never hydrated. It is now
   detected, but detection in one environment is not coverage.

2. **The route-opportunity margin is thin.** In the adversarial case a
   door-passing provider beats a nearer one by 0.2 points. The ranking is
   right and the banding is deliberate, but a 0.2-point margin is a
   calibration waiting to be disturbed by any weight change.

3. **The rating aggregate has no reviews behind it.** Everything the product
   *says* about it is true, and it refuses to draw a distribution it cannot
   support. But a customer reading "4.8 (156)" with no reviews to open is
   being shown a number whose detail does not exist.

Claiming 95+ would require either doing that work or discounting it. Both are
worse than reporting 94.

## What would move it

| Deduction | Work |
|---|---|
| §8 (−2) | A device matrix in CI, including iOS Safari, plus a synthetic check that the provider switch actually toggles on a handset. |
| §2 (−1), §4 (−1) | Recalibrate route-opportunity banding against real declines, and expose weights in the admin UI so the calibration is testable without a deploy. |
| §7 (−1) | Either generate completed jobs and reviews behind the seeded aggregates, or drop the aggregate for seeded providers and show only `חדש`. |
| §10 (−1) | CI running the full gate set, plus a concurrency test on acceptance and a sustained-throughput test on dispatch. |
