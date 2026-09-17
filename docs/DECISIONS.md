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

---

## D-022 — A provider may propose their own trade; an admin resolves it

**Context.** The catalog ships 7 categories and 23 services. That is not the
set of trades people do, and a provider whose work is absent had no way in at
all: `find_candidate_providers` INNER JOINs `provider_categories`, so with no
declared trade they are not a weak candidate — they are absent from every
search, permanently. The same failure as D-016's invisible provider, one
layer up.

**Decision.** Free text, held as a **proposal** with no effect on matching
until an admin resolves it. Approval creates a **service under an existing
category**, links the provider to both, and carries the trigger phrases that
make it reachable. Rejection records a reason the provider can read.

**Why a service and not a new category.** `jobs.category_id` drives the
candidate search, and a category carries behaviour configuration: which
booking modes it supports, its default radius and duration, whether it
requires a licence or insurance. A category invented per proposal arrives
with none of that and no customers, so it would be a category nobody is ever
matched into. Creating whole categories stays an out-of-band operation.

**Why phrases are required, not optional.** This is the part that was
tempting to skip. The classifier routes a customer's description to a service
by matching phrasings, and those phrasings were hard-coded in TypeScript. A
service created without them can never be reached by any description: the
provider would be told "approved" and would still never receive a job. So
`services.strong_phrases` / `weak_phrases` moved the phrasings into data, the
classifier merges them with its built-in rules, and `phrases` is a required
field on the approve action — at the Zod schema, and again inside
`approveTradeProposal`. A fake approval is unrepresentable rather than
discouraged.

The merge is additive and the built-in rules are unchanged, so adding a trade
cannot silently break an existing classification. A test asserts the four
canonical descriptions still resolve exactly as before.

**Consequences and guards.**

* The provider is told, in those words, that no jobs will arrive until it is
  approved — on the form, and on every pending row.
* `trade_proposals` has **no UPDATE policy for the owning provider**. An
  "own row" policy would have let them write their own `APPROVED`. Tested
  both through the domain function and by raw SQL.
* Approval runs entirely as the admin, so RLS is the gate: `services` is
  writable only where `is_admin()`.
* One live proposal per trade per provider, and at most 5 pending — a review
  queue a human reads is a shared resource.
* A near-duplicate count is shown to the reviewer, because approving one
  creates a second service meaning the same thing and splits providers
  between them.
* Price guidance on the new service is a band around what the provider asked
  for. No price means no guidance, rather than a band invented around
  nothing.

## D-023 — Notifications are written by the system, never by an admin

**Context.** The first version of `approve_trade` inserted the provider's
notification inside the admin's transaction. `notifications` has **no INSERT
policy at all** — it is a table users read and the system writes — so the
insert was refused and the entire approval rolled back. The action could
never succeed.

**Decision.** Notifications are sent through `withSystem` after the
transaction commits, and a failure is logged rather than raised.

**Why the asymmetry with the audit row.** D-013's rule was that the audit row
commits with the change, and that still holds: the audit is the record of
authority, and an unaudited admin action must be impossible. A notification
is a courtesy. Losing one must not undo a decision that was correctly made
and correctly recorded — the provider still sees the outcome on their own
screen. Adding an INSERT policy so admins could write notifications was the
alternative, and it would let an admin forge a message that appears to come
from the system.

---

## D-024 — The bulk of the catalog carries its phrases in data, not in code

**Context.** Migration `0028` added 39 services to the 7 existing categories,
taking the catalog from 23 to 62. Each needed the phrasings that let the
classifier route a description to it. Those could have gone into
`SERVICE_RULES` in TypeScript, beside the original 23.

**Decision.** They went into `services.strong_phrases` / `weak_phrases`, read
by the same merge D-022 built for admin-approved trades.

**Why.** It puts most of the catalog through the path an approval uses, so
that path is exercised constantly rather than only when someone proposes a
trade. A mechanism used once a month is a mechanism nobody notices is broken.
It also means editing coverage is a data change rather than a deploy, which is
what a growing catalog needs.

**Consequences.** The classifier now iterates the 23 built-in rules plus ~40
from data. Both compete on score and the more specific phrase wins, so adding
a service cannot silently capture an existing one — asserted for the 16
canonical descriptions. Phrase authoring has rules of its own, because token
matching is by substring and morphology does not carry: `החלפת דוד` does not
match "צריך להחליף דוד", so each plausible form is listed rather than assumed.
Migration `0028` and `catalog-reachability.test.ts` both refuse a service with
no way to be found.

## D-025 — The simulator plays back a recorded dispatch instead of imitating one

**Context.** The interface simulator (`docs/demo/getservice-simulator.html`)
carried its own copy of the data: a catalog of 23 services, five providers,
and its own JavaScript re-derivation of the score — `100 - ((price - ref) /
ref) * 140` for price, `62 - km * 8` for route opportunity, and so on. Once
the catalog grew to 62 it also drifted out of date. But staleness was the
smaller problem: those formulas were never the engine's. At the reference
price the real `scorePrice` returns 50 and the simulator's returned 100, so
every number the page displayed was a plausible invention presented as the
system's own output.

**Decision.** The page carries a recording, not a model. A real job was
dispatched through the real engine against the seeded network, and the
`matching_events` row for each candidate — every per-signal score, the final
score, the ETA, the distance, the route verdict — is what the page holds. The
total is recomputed only as `Σ score × weight`, which is exactly what
`engine.ts` does, and it reproduces the recorded `final_score` to the cent.
The description classifier is the one thing genuinely computed in the page,
because typing into the box has to do something: its rules are the merge of
`SERVICE_RULES` and `services.strong_phrases`, and its `normalise` /
`phraseMatches` / `phraseScore` are the same functions. It agrees with
`/api/understand` on 20 descriptions, confidence included.

**Why.** A demo of a matching engine whose numbers are not the engine's
numbers argues for a product that does not exist. The one signal that does
legitimately change with the customer's timing — availability, where planned
hours decide and the live switch does not — is substituted with the value
`scorers.ts` uses when a live fix is not required, and the substitution is
stated on the page.

**Consequences.** The candidate list is one dispatch, so it does not follow a
reclassification; the page says so when the classified service is not the
recorded one rather than implying these seven are candidates for anything.
Refreshing the recording means re-running the dispatch and regenerating the
constants. Two invented things went with the formulas: a rating distribution
derived from the review count with fixed 82/13/3/2 ratios, drawn directly
beneath the sentence "no written reviews yet, and no distribution is shown
because there is nothing to base one on" — the endpoint returns
`ratingBreakdown: null` for every one of these providers, so nothing is drawn
— and a proposer's name borrowed from a provider row.

## D-026 — Provider-facing copy addresses people in the plural, not the masculine

**Context.** The onboarding form, the availability editor and the console
addressed the provider as `אתה`: "באיזה תחום אתה עובד?", "סמן רק מה שאתה
מבצע", "אתה לא מקוון". The customer-facing profile sheet labelled the service
list "מה הוא עושה". Hebrew has no neutral singular second person, and the
seeded network is roughly half women — so did the recorded candidate list,
where six of the seven are.

**Decision.** Second person plural (`אתם`, `סמנו`, `הזינו`), which is
idiomatic Hebrew for an interface and carries no gender. The one label that
was third person became a description of its contents: "שירותים ומחירים".

**Why.** Addressing half the providers as men is a defect in the product, not
a matter of style, and it is visible on the first screen a provider sees.

**Consequences.** Nine strings in four files, and the simulator follows them,
because it promises the same text as the app. No API, schema or test change.

## D-027 — An admin can create the category, and must state what it demands

**Context.** Approving a provider-proposed trade required picking one of the
seven shipped categories. A trade that is genuinely none of them — moving,
painting, carpentry, appliance repair — left the reviewer with two bad
options: reject something real, or file it somewhere wrong. Filing it wrong
is not cosmetic. The category carries the working radius, the default
duration and whether a licence and insurance are required before
verification, so a mover filed under `plumbing` inherits a plumber's
paperwork and a plumber's radius.

**Decision.** `approve_trade` takes either `categorySlug` or `newCategory`,
never both and never neither, and the new-category payload requires
`requiresLicense` and `requiresInsurance` as booleans rather than defaulting
them. The category is created in the same transaction as the service, the
provider link and the audit row.

**Why the two flags are required.** Neither default is safe. False quietly
admits a new regulated trade with no documents; true demands documents from a
cleaner. There is no value that is right when unspecified, so the reviewer
states it. `requires_documents` is then derived — either flag means there is
something to produce — rather than being a third thing to get wrong.

**Why find-or-reuse rather than insert.** A second category named "הובלות" is
not a new category, it is a split: some providers register under one,
customers are routed to the other, and nothing on either screen explains why
the work never arrives. The lookup folds case and trims, and migration `0029`
adds a unique index on `lower(btrim(name_he))` where active, so two reviewers
racing end in a constraint violation the API maps to "that category already
exists — pick it from the list" rather than in two categories.

**Consequences.** `categories.name_en` became nullable, for the same reason
`services.name_en` did in `0026`: an admin typing "הובלות" has no English
name, and inventing one or storing Hebrew in a column labelled English both
put false data in a named field. A created category is tagged with its own
slug as its `required_skills`, because a category with none scores every
provider in it the same neutral 80 and nobody in a new trade could ever be
distinguished by competence. Its `sort_order` places it after the shipped
seven. `cleanupTestData` removes `cat_%` categories for the same reason it
removes `custom_%` services.

**A bug this surfaced.** The approval linked the provider with
`skills = '{}'`. Dispatch takes a job's required skills from the service or,
failing that, the category, and scores them against that row — so an approved
provider matched none of them and scored 10 out of 100 on skill match, 20% of
the decision. They were findable and then ranked about eighteen points below
every competitor, permanently, for a skill the approval had just asserted
they have. It is now the category's own skill set, unioned on conflict, which
is what `/api/provider/setup` already did on the ordinary path. Asserted by a
test that reads `skill_score` from `matching_events` after a real dispatch,
and confirmed to fail on the reverted fix.

## D-028 — A service carries two names, because two different people read it

**Context.** `services.name_he` is the customer's words for a problem:
"מזגן לא מקרר", "ננעלתי מחוץ לבית", "סתימה בצינור". That is deliberate and it
has to stay — the classifier routes a typed description to a service, and the
request screen shows the customer what we understood.

The registration form then showed that same list to a provider under "מה אתם
עושים, ובכמה?". A technician searching "גז" was offered "מזגן לא מקרר",
"המזגן לא נדלק", "מזגן מטפטף": a column of symptoms where a list of services
belonged. It reads as though the platform does not know what the trade is,
and a professional pricing "ננעלתי מחוץ לבית" is being asked to price someone
else's sentence.

**Decision.** `services.provider_label` (migration `0030`), populated for all
62 shipped services, read through `coalesce(provider_label, name_he)`.
Customer-facing surfaces keep `name_he`. The registration form, the
provider's own service list and the profile's "what they do" list use the
label — including on the customer's screen, because a list of what a person
does is a list of services whoever is reading it.

**Why not rename the rows.** The names are not interchangeable and neither is
wrong. Renaming `ac_not_cooling` to "תיקון מזגן שלא מקרר" would push trade
phrasing into the customer's screen and into the classifier's vocabulary,
where the customer's own words belong. Two columns on one row keeps matching,
pricing and classification untouched: only which name a given screen reads
changes.

**Consequences.** Nullable and coalesced, so a row created before the
migration still renders. An approved trade stores the provider's own words as
the label and the reviewer's name, if they set one, as the customer-facing
name. Migration `0030` fails if any shipped service is left without a label,
because a missing one silently falls back to the customer's words — exactly
the mixed list this exists to end.

## D-029 — The documents table starts holding documents, and gates verification

**Context.** `provider_documents` shipped in migration `0007` with the right
row security in `0011`: a provider reads and inserts only their own rows, and
only an admin may `UPDATE`, so nobody can approve their own licence. Nothing
ever wrote to it.

The result was a dead end in three places at once. The registration form told
a provider "התחום הזה דורש רישיון וביטוח. המנהל יבקש את המסמכים לפני האימות"
and gave them nowhere to put either one. The admin had nothing to look at.
And `verify_provider` would happily mark a licensed trade `VERIFIED` with no
licence anywhere in the system — so `requires_license` was a sentence on a
form rather than a rule.

**Decision.** An upload endpoint, a download endpoint, per-document review,
and a gate: `provider_missing_documents(uuid)` in migration `0031` returns the
required kinds a provider has no valid approval for, and verification refuses
while it is non-empty. The admin queue shows the same answer, from the same
function, so a reviewer sees what is missing instead of discovering it by
clicking.

**Why the bytes live in Postgres.** `0007`'s comment promised "storage" and "a
short-lived signed URL" from an object store this deployment does not have,
and a signed URL we cannot sign is worse than no URL — that promise is part of
why nothing was ever stored. A licence scan is a few hundred kilobytes and
there is one per provider, so the table grows with the provider count rather
than with traffic. In exchange the bytes inherit the row security the
documents table already had, they commit in the same transaction as the row
that describes them, and they survive a container being recycled, which a
local filesystem in this environment would not. `storage_path` stays an opaque
locator (`db://<id>/<nonce>`), so an object store later is a new
implementation of `DocumentStorage`, not a schema change.

**Why the type comes from the file's own bytes.** A client-declared
Content-Type is a request, not a fact. A provider could otherwise upload an
HTML file labelled `image/png`; served back from our own origin, that is
script execution inside an admin session which can verify providers and read
every document in the queue. `sniffDocumentType` reads the magic bytes and
accepts four formats; the type we store and later serve is the one we
recognised. The file is served as an attachment, with `nosniff`, a
`default-src 'none'; sandbox` CSP and `private, no-store` — the sniffing makes
the header honest, and the headers make the honesty redundant.

**Consequences.** There is no public URL and the interface cannot produce one:
every read goes through a handler that runs the SELECT as the caller, so RLS
is the authorization and there is no second answer to the same question. A
provider may withdraw a `PENDING` document (new DELETE policy, `PENDING` only)
but not one already reviewed, because a rejection is a record rather than a
draft. Suspending and rejecting a provider are deliberately NOT gated: taking
somebody out of the market is the action you least want to be unable to take.
One pending document per kind, so the reviewer's queue cannot be filled with
copies. Uploads and reads are rate-limited, and neither the filename nor the
document number is ever logged.

**Two bugs found while building it.** The upload originally inserted the row
and then patched `storage_path` onto it — but there is no owner `UPDATE`
policy, precisely so a provider cannot approve their own licence, so the
update silently matched no row and every document was stored unreadable. The
id and the locator are now decided before the `INSERT` and go in with it;
found by a test that asserted the path, not by anything the upload reported.
And `expires_on` is a `DATE` that node-postgres returns as a `Date`: serialised
to JSON it became `"2028-06-30T00:00:00.000Z"`, a timestamp the document does
not have, which lands on the previous day for any viewer west of UTC. Both
endpoints now return it as text.

**A control we could not fix, so we made it legible.** Chromium renders a
date input's placeholder as `mm/dd/yyyy` even under `--lang=he-IL`, so an
Israeli provider is shown American order in a field where 30/06 and 06/30 are
both plausible. The stored value was always ISO, so nothing was wrong with the
data — but rather than leave the ambiguity, the screen echoes what it
understood in words: "כלומר: 30 ביוני 2028". Same family as the time input in
the availability editor (D-018), and the same conclusion: a native control
whose chrome is not ours needs either replacing or explaining.
