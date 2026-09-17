# The interface simulator

`getservice-simulator.html` is one self-contained file: no build, no server,
no network. Open it in a browser and it shows four views of the product —
the customer's side, the registration form, the provider's side and the
review queue — beside a panel that names the row or the function each screen
is standing on.

It is kept here because it is a deliverable, not scaffolding, and because a
published copy is not a source.

## What in it is real

Everything numeric. The page holds a **recording** of one dispatch, not an
imitation of the engine:

1. A job was created through `POST /api/jobs` as the seeded customer
   `rotem@demo.local` — description `יש לי נזילה מתחת לכיור`, fix at
   `32.0742, 34.7749`, `timing: NOW` — against the synthetic network
   (`SEED=20260917 COUNT=1000 npm run db:network`).
2. The real dispatch ran. Five of the 25 candidates received a wave-1 offer.
3. Every candidate's `matching_events` row was read back: each per-signal
   score, `final_score`, `eta_minutes`, `straight_distance_km`,
   `is_on_the_way`. The page's `PROVIDERS` constant is those values.
4. Profile facts came from `GET /api/providers/{id}` — the same
   customer-facing endpoint the app calls, including its
   `ratingBreakdown: null` for a provider with no review rows.
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

## Refreshing the recording

Re-seed, dispatch a fresh job, and regenerate the two constants from
`matching_events` and the catalog. The recording is only as current as the
seed it was taken against, and a rerun of the seeder writes fresh location
fixes (see `docs/SEED_DATA.md`), which is what makes a fresh dispatch
possible at all.
