# The interface simulator

`getservice-simulator.html` is one self-contained file: no build and no
server. It fetches exactly one thing — its two webfonts from Google Fonts —
and without a connection it falls back to system faces and everything else
works. (This paragraph used to say "no network", which was simply not true of
a page carrying a `<link>` to fonts.googleapis.com.) Open it in a browser and
it shows four views of the product —
the customer's side, the registration form, the provider's side and the
review queue — beside a panel that names the row or the function each screen
is standing on.

Below the phone sits the **operator stage**, which is where the rest of the
system is. Admin is desktop-first in the real product (spec §42), so these
four views are full width rather than pretending a control tower fits in a
phone bezel:

| View | What it runs on |
|---|---|
| **מסלול העבודה** | The 41 rows of `job_transitions` — the table the database trigger validates every move against. Only legal moves are offered, each labelled with who may make it. A move the explorer refuses is a move the system refuses. |
| **מגדל בקרה** | The counters and analytics `GET /api/admin/overview` answered, on a 10,000-provider network. |
| **מעבדת התאמה** | Eight weight sliders over the recorded per-signal scores, recomputing `Σ score × weight` — the same arithmetic as `engine.ts`. Drag route opportunity to zero and טל אזולאי climbs fifteen places to first, which is the thesis stated as a control rather than a paragraph. |
| **עמלה ותשלום** | The active tiered rule from `platform_fees` applied to recorded prices. No payment happens; the provider is `mock` and says so. |

It is kept here because it is a deliverable, not scaffolding, and because a
published copy is not a source.

## What in it is real

Everything numeric. The page holds a **recording** of one dispatch, not an
imitation of the engine:

1. A job was created through `POST /api/jobs` as the seeded customer
   `rotem@demo.local` — description `יש לי נזילה מתחת לכיור`, fix at
   `32.0742, 34.7749`, `timing: NOW` — against the synthetic network
   (`npm run db:network -- --seed 20260917 --count 10000 --reset`).
2. The real dispatch ran. Of 50 candidates considered, the engine scored 43
   and sent five a wave-1 offer. The seven it did not score were excluded as
   `location_not_live` before any signal was computed, so they carry no
   numbers; the 38 it scored but did not offer carry `below_cut`.
3. Every SCORED candidate's `matching_events` row was read back: each
   per-signal score, `final_score`, `eta_minutes`, `straight_distance_km`,
   `is_on_the_way`. The page's `PROVIDERS` constant is those 43 rows.
4. Profile facts came from `GET /api/providers/{id}` — the same
   customer-facing endpoint the app calls. 41 of the 43 now carry a real
   `ratingBreakdown`, because the network's ratings are derived from actual
   `reviews` rows; the two that do not are genuinely new providers with no
   reviews, and the endpoint answers `null` rather than a 0/0/0/0 that would
   read as "nobody gave five stars". An earlier recording showed `null` for
   everyone and review counts in the hundreds — aggregates on the provider
   record with nothing behind them. The counts here are single and double
   digits, and each one is a row.
5. `CATALOG` was read from `categories` and `services`, carrying both names
   per service: the customer's words for the problem, which the classifier and
   every customer screen use, and the provider's name for the work, which the
   registration form uses (migration `0030`).

The page recomputes only the total, as `Σ score × weight` with the weights
from `settings.matching.weights`, which is what `engine.ts` does; it
reproduces each recorded `final_score` to the cent. See **D-025** for why the
page stopped deriving the signals itself.

The description classifier is the one thing genuinely computed in the browser,
because typing into the box has to do something. Its rules are the same merge
the server uses — `SERVICE_RULES` plus `services.strong_phrases` /
`weak_phrases` — and `normalise`, `phraseMatches` and `phraseScore` are the
same functions. It was checked against `POST /api/understand` on 20
descriptions and agrees on category, service, urgency and confidence.

The customer's job now runs to the end: match → arrival → work → the
customer's confirmation → payment → review → `REVIEWED`. The stretch the
customer only watches (the provider arriving, starting, finishing) advances
on its own, because those are the provider's moves in `job_transitions` and
the customer's screen just updates as they happen. The three that are the
customer's — confirming, paying, reviewing — are buttons, because they are
decisions. Pauses are compressed and each screen names the status it is in.

## What in it is not real

There is no server and no payment. The candidate list is one dispatch, so it
does not change when a different description classifies elsewhere; the page
says so on screen when that happens. Nobody in it is a real person: every
provider is a synthetic row tagged `is_demo`.

The review view's writes are local to the page: approving a proposal there
pushes the new service and its trigger phrases into the page's own catalog and
rule set, so the registration form can then find it and a description can then
route to it — which is the behaviour of the real approval, done in memory. It
touches no database.

The document step uploads nothing — there is no file picker and no bytes.
What it reproduces is the state machine: the provider can move a document to
`PENDING` and no further, because `provider_documents` has no owner `UPDATE`
policy, and only the review view moves it to approved. The rail and the panel
show `provider_missing_documents` the way the real gate reads it, including
the refusal a reviewer gets while anything is outstanding.

## Refreshing the recording

```bash
npm run db:network -- --seed 20260917 --count 10000 --reset   # fresh fixes
npm start &                                                    # or npm run dev
node scripts/record-simulator.mjs
```

This used to be a paragraph of instructions instead of a script, which is how
the shipped page came to be describing a 1000-provider network with
`ratingBreakdown: null` for everyone long after neither was true. **A
documented manual process is a process that drifts.**

It also writes the `SYSTEM` constant the operator stage runs on: the legal
transitions, the matching weights, the dispatch waves, the timeouts, the
thresholds, the fee tiers and the control tower's own numbers. Those are
settings rows and catalogue rows, so they drift exactly like the recording
does.

Two things the script will not do quietly. It refuses to write a recording
whose `Σ score × weight` does not reproduce every recorded `final_score` to
within 0.05, because reproducing that total is the page's entire claim. And
it records every candidate the engine *scored*, not only the ones it offered
— the first version filtered on `excluded_reason is null` and silently
recorded 5 rows where there should have been 43, dropping exactly the
`below_cut` candidates that make the thesis visible.

The seeding step is not optional. Demo location fixes go stale after 120
seconds and the matcher refuses to treat a stale fix as live, so a dispatch
against a network seeded yesterday returns 50 candidates and zero offers —
correctly. Re-running the seeder writes fresh fixes (see `docs/SEED_DATA.md`),
which is what makes a fresh dispatch possible at all.
