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

**Re-scored from 94 to 97** after closing the §7 and §10 deductions and half
of §8. Worth stating plainly: two of the things fixed in between were not
deductions at all, because nobody had noticed them. Nothing called the
maintenance tick, so every time-based behaviour in the platform silently did
not happen; and the rate limits reset on every restart. Both were scored as
working. A rubric only measures what somebody thought to look at, which is the
argument for the structural guards rather than for the score.

| # | Criterion | Max | Score | Evidence, and what is missing |
|---|---|---|---|---|
| 1 | Product clarity — one question, no obstacles | 10 | **10** | Home asks *what* and *when*, then one button. Category grid, radius, rating and price filters, and two of three CTAs deleted (UX_PRINCIPLES 1–2). Rejecting a match is its own action rather than a cancellation (D-020). |
| 2 | Route opportunity is the primary signal | 10 | **9** | 25% weight, three evidence bases, piecewise banding. Proven on live data: רם at 4.32 km outranks דן at 1.35 km. **−1:** the adversarial margin is 0.2 points (A-004, R-001) — correct, but thin. |
| 3 | Availability: realtime **and** planned | 10 | **10** | Both, with a documented precedence and 16 integration tests. The §52 property holds: changing the requested time flips eligibility. |
| 4 | Matching engine — configurable, inspectable | 10 | **9** | Nine-stage pipeline, Zod-validated weights summing to 1.0, per-candidate breakdown, `/matching-lab`, a per-job debugger. **−1:** weights are editable only through the settings API, not a UI. |
| 5 | State machine — server-authoritative | 10 | **10** | `job_transitions` as data, a `BEFORE UPDATE` trigger, a TS mirror asserted against all 240 status pairs. |
| 6 | Security — RLS, transactional acceptance | 10 | **10** | 53 policies, tested through the real PostgREST contract; 27 security tests including 8 that prove the harness can fail. Acceptance is `FOR UPDATE` + `UNIQUE(job_id)`. |
| 7 | Honesty — no fake functionality | 10 | **10** | Mock payments and the stand-in notifier both report `isReal: false` and are refused in production; no invented locations, ETAs or route claims; stale GPS drops out of matching; `COMPARE` refused rather than dead-ended. A-013 is closed: seeded ratings are now derived from 10,908 real review rows, with four validator checks asserting the aggregate equals its detail (D-032). No review comments were invented. |
| 8 | Visual and UX craft | 10 | **9** | One dark identity, 18/18 measured contrast, RTL asserted, 44px targets, motion that explains. The audit now runs at 320, 390, 768 and 1440 px and found a real 39px overflow on its first run. **−1:** still one engine. iOS Safari is untested and this environment cannot run it (R-021). |
| 9 | Seed realism at scale | 10 | **10** | 1,000 deterministic providers across 32 weighted regions; ratings generated with their counts; 32 validation checks; environment-guarded; idempotent. |
| 10 | Testing and verification discipline | 10 | **10** | 267 tests / 31 files; every bug in QA.md was found by running the system. Structural guards for classes of bug types and lint cannot see. CI runs the full gate set plus a seed job on every push. Acceptance is proven under real concurrency — five simultaneous accepts, exactly one winner — and twenty concurrent dispatches hold their integrity. |

**Total: 97 / 100.**

## What changed, and what did not

Three of the four deductions from the first scoring are closed, and the
closing was work rather than argument:

* **§7 is now 10.** The seeded rating aggregate is derived from 10,908 real
  review rows, and four validator checks assert it cannot drift back
  (D-032). The cost is a network that reads as young — 24 reviews rather
  than 2,741 — which is what being true costs here.
* **§10 is now 10.** CI runs lint, types, 267 tests, contrast and build on
  every push, with a second job that seeds a thousand providers and runs 36
  invariants. Acceptance is proven under real concurrency: five simultaneous
  accepts, exactly one winner, named failures for the losers, one assignment
  and one BUSY provider.
* **§8 moved 8 → 9.** The audit runs at four widths and found a real 39px
  overflow the first time it did.

## Why this is not ≥ 98

Three deductions remain, and they are the same three that were always the
hardest:

1. **One browser engine.** The audit covers 320, 390, 768 and 1440 px, which
   is four times what it covered, and every one of them is Chromium. iOS
   Safari is the single largest share of this product's likely traffic and
   this environment cannot run it (R-021). The provider console is entirely
   client-driven and its failure mode is silent — a page frozen in its
   loading state looks plausible — so detection in one environment is not
   coverage.

2. **The route-opportunity margin is thin.** In the adversarial case a
   door-passing provider beats a nearer one by 0.2 points. The ranking is
   right and the banding is deliberate, but a 0.2-point margin is a
   calibration waiting to be disturbed by any weight change (A-004, R-001).

3. **The weights are editable only through the settings API.** The
   calibration above cannot be tested by the person who understands it
   without a deploy.

Claiming higher would mean discounting those. 97 is what the evidence
supports.

## What would move it

| Deduction | Work |
|---|---|
| §8 (−1) | A WebKit or real-device run in CI, plus a synthetic check that the provider switch toggles on a handset. |
| §2 (−1) | Recalibrate route-opportunity banding against real declines rather than against generated ones. |
| §4 (−1) | Expose the matching weights in the admin UI, so the calibration is testable without a deploy. |

## Still true, and still not in the product

Named here so the score is not read as "finished":

* Payments are a mock. `assertPaymentProviderIsSafe` refuses production
  without `DEMO_MODE`, so nothing can ship quietly, and no money moves
  (R-009).
* Notification delivery has the outbox, the retries and the abandon path, and
  a stand-in adapter at the end of them that reaches nobody (R-020).
* ETAs are estimated geometrically unless `MAP_PROVIDER=osrm` (R-003).
* `messages` has no chat built on it. The table is there; a customer and a
  provider talk by telephone.
* Backups, monitoring and secret rotation are deployment concerns this
  repository does not attempt.
