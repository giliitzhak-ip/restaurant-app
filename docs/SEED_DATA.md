# Seed data

There are **two** datasets, and the difference matters.

| | `npm run db:seed` | `npm run db:network` |
|---|---|---|
| Size | 22 providers, a handful of customers, an admin | 1,000 synthetic providers |
| Logins | yes, password `demo1234` | **no credentials at all** |
| Purpose | drive the product by hand | make the tables look like a real market |
| Identity | `*@demo.local` | `gsnet-NNNNN@synthetic.local` |
| Browsable | no | no |

Both are tagged `is_demo = true` on every row they write.

## The non-negotiables

* **Synthetic providers are never presented as real.** They are data, not
  people: no photographs, no fabricated reviews, no invented certifications.
  A customer-facing profile shows initials, the aggregate the record carries,
  and the services actually priced.
* **They are never a directory.** There is no "browse professionals" screen,
  and there never should be. The product's answer to "who should come" is a
  matched opportunity, not a list to shop through — and a list of 1,000
  names that cannot answer the phone is worse than no list.
* **They cannot reach production.** `seed-network.mjs` refuses to run when
  `NODE_ENV=production` unless `DEMO_MODE=true` is also set explicitly. There
  is no flag that bypasses both.
* **They cannot accept work.** No `encrypted_password`, so no session, so no
  authenticated call. The demo simulator can accept *on their behalf* only
  with `DEMO_MODE=true`, only for `@synthetic.local` providers, only on jobs
  whose customer is `is_demo`, and only by calling `accept_job_offer()` as
  that provider — the same transaction, single-winner rule, state machine and
  audit trail as a real acceptance. Nothing is written directly.

## Why 1,000 and not 20

Twenty providers cannot show whether the system works. A candidate query is
fast when there is nothing to filter; a ranking is obviously correct when
there are three candidates; a "no providers nearby" branch never runs. The
network exists so that the interesting cases occur naturally:

* the candidate query had a **fixed cost** independent of results (62 ms with
  zero candidates) — visible only at scale, fixed by migration `0019`
  reordering the filters, 94 ms → 17 ms;
* dispatch waves actually escalate, because wave 1 genuinely does not always
  find someone;
* a route-opportunity match has real competition to beat.

## Generation

`scripts/lib/synthetic.mjs` holds the distributions; `scripts/seed-network.mjs`
writes them.

* **Deterministic.** A mulberry32 PRNG seeded from `SEED` (default
  `20260917`), and provider UUIDs derived from the provider key by a stable
  hash. The same seed produces byte-identical data, so a matching bug found
  on this dataset can be reproduced exactly:
  `SEED=20260917 COUNT=1000 npm run db:network -- --reset`.
* **Idempotent.** A rerun converges rather than accumulating. This was wrong
  at first: `service_areas` and `provider_availability_rules` have no natural
  unique key — a provider may legitimately have two areas, or two windows on
  one weekday — so `ON CONFLICT` could not help, and a second run silently
  doubled every schedule while every other table upserted cleanly. Row counts
  still looked plausible. The batch now clears its own rows first, and
  `validate-seed.mjs` asserts no duplicate window or area exists.

  `provider_locations` had the opposite bug: it upserted with `ON CONFLICT DO
  NOTHING`, so a rerun kept the fixes from the first run and every one of them
  aged past `maxLocationAgeSeconds`. The network stayed present and became
  unmatchable — a dispatch excluded all 25 candidates with
  `location_not_live`, and rerunning the seeder could not repair it, because
  the seeder was the thing declining to write. It now writes the fresh fix,
  heading, speed, accuracy and destination on conflict. The deliberately stale
  fixes are still stale: staleness is generated per provider, not an artifact
  of when the script last ran.

### What is varied, and why

| Dimension | Shape |
|---|---|
| Geography | 32 Israeli regions, weighted by real population density, each with its own spread radius. Tel Aviv is crowded; the Arava is not. A uniform scatter would make every query look the same. |
| Category | Weighted — plumbing and electrical are common, pest control is not. |
| Rating | Generated **with** its review count in six tiers, so 4.9 comes with hundreds of reviews and 4.2 with a few dozen. A rating and a count drawn independently produce nonsense like 5.0 from two reviews sitting above 4.8 from three hundred. |
| New providers | ~9% have `rating_avg = null` and `rating_count = 0`, so the "no rating yet" path is exercised by data rather than only by a test. They show `חדש ב-GET SERVICE`, never `0.0`. |
| Verification | Mostly `VERIFIED`, some `PENDING`, a few `REJECTED`/`SUSPENDED`. |
| Realtime state | ~59% `ONLINE` at seed time. |
| Weekly hours | Several shapes: standard weekday, long-hours, split shift, weekend-inclusive, and ~25% with no declared hours at all. |
| Date overrides | 342 upcoming exceptions, both blocks and replacement windows. |
| Locations | Some fresh, some deliberately **stale**, some absent — so the "a stale fix is not a live fix" rule is exercised by real data. |
| Destinations / headings | 288 providers are travelling somewhere, which is what makes route opportunity testable at all. |

## Validation

`npm run db:validate` runs 32 checks and exits non-zero on any failure.
Coverage checks assert the dataset is varied enough to be worth testing
against; integrity checks assert it is not self-contradictory:

* a rating with no reviews, or reviews with no rating;
* `rating_count > completed_jobs` (a review requires a completed job);
* `offers_accepted > offers_received`;
* a schedule or override window that ends before it starts;
* a weekday outside 0–6;
* coordinates outside an Israel envelope (sanity, not geofencing — a
  synthetic provider in the Atlantic is a bug);
* a service priced outside a category the provider declared;
* **a verified provider with no service area**, which found two real rows
  created by ad-hoc probing earlier in development;
* a synthetic row missing its `is_demo` tag;
* an `ONLINE` provider who is not verified.

One check is order-dependent, deliberately: `stale locations present`. The
demo tick refreshes every demo location, so after a demo run the property is
genuinely gone and the check fails — with a hint saying so, rather than
looking like a corrupt dataset. Validate on a freshly seeded network.

## Honest gap

The 22 demo providers and the 1,000 synthetic ones carry a rating aggregate
(`rating_avg`, `rating_count`) with **no review rows behind it**. A review
requires a completed job, and fabricating ~150,000 completed jobs to fill a
bar chart would pollute every operational view in the product for a cosmetic
gain.

So the profile API returns `ratingBreakdown: null` when no review rows exist,
and the UI shows the aggregate alone. A `0/0/0/0` distribution beside
"341 ביקורות" reads as "nobody gave five stars", which is a claim there is no
basis for. Quoted reviews come only from real rows, which for seeded
providers means none.
