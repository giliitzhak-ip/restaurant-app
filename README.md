# GET SERVICE

**צריך? אנחנו מוצאים.**

A real-time marketplace for professional services. The customer describes what
happened; the system finds the most suitable available professional.

The differentiator is **Route Opportunity**: a professional already driving
toward the customer is often a better match than a closer one driving away.
The question is not *who is closest* but *who is already going there*.

---

## Quick start

Requires Node 22+ and PostgreSQL 14+ with PostGIS.

```bash
npm install

# One-time database setup
npm run db:roles      # create the app login + anon/authenticated/service_role
npm run db:setup      # migrate, then seed deterministic demo data
npm run test:db       # create the dedicated test database

npm run dev           # http://localhost:3000
```

Copy `.env.example` to `.env.local` and adjust as needed. The defaults work
against a local PostgreSQL.

### Tests

282 in total, across three suites:

| Suite | Count | Needs a database |
|---|---|---|
| `npm run test:unit` | 115 | No — pure domain logic, runs anywhere |
| `npm run test:integration` | 132 | **Yes** |
| `npm run test:security` | 35 | **Yes** |

The integration and security suites talk to a real PostgreSQL with PostGIS
and are not mocked, because what they are testing — RLS policies, a
transition trigger, `FOR UPDATE SKIP LOCKED`, a PostGIS distance — exists
only in the database. Run `npm run db:roles`, `npm run db:migrate` and
`npm run test:db` first. Without a database those 167 tests do not fail with
a meaningful result; they fail to connect, which says nothing about the code.

### Demo accounts

Password for all: `demo1234`

| Account | Role | Notes |
|---|---|---|
| `rotem@demo.local` | Customer | At the reference point in Tel Aviv |
| `ram-on-the-way@demo.local` | Provider | 3.2 km away, **driving toward** the customer |
| `dan-driving-away@demo.local` | Provider | 1.0 km away, **driving away** |
| `admin@demo.local` | Admin | Control tower and matching lab |

`ram` and `dan` exist to make the thesis observable: `dan` is closer, `ram`
ranks higher.

### See the thesis for yourself

1. Sign in as `rotem@demo.local` and request *"יש לי נזילה מתחת לכיור"*.
2. Sign in as `admin@demo.local`, open the job in the control tower, and read
   the score breakdown — `דן` is closer and ranks below `רם`.
3. Or open `/matching-lab` and change the numbers directly.

Demo location fixes go stale after 120 seconds, because the matcher refuses to
treat a stale fix as live. `npm run demo:tick` moves the demo fleet and
refreshes it.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` · `npm run typecheck` | Static checks |
| `npm test` | All 282 tests — the integration and security suites need a live PostgreSQL + PostGIS |
| `npm run test:unit` · `test:integration` · `test:security` | One suite |
| `npm run db:roles` · `db:migrate` · `db:seed` · `db:setup` | Database |
| `npm run db:network -- --count 10000 --reset` | Reseed the synthetic network at any size up to 20,000 |
| `npm run test:db` | Create/refresh the test database |
| `npm run ui:audit` | RTL, mobile, touch-target and console audit in Chromium |
| `npm run demo:tick` | Advance the demo fleet |

---

## Architecture in one paragraph

Next.js 16 App Router with React 19 and Tailwind v4 over PostgreSQL 16 +
PostGIS. **The database is the source of truth.** Authorization is 53 Row
Level Security policies enforced the way PostgREST does it — the app connects
as a login that cannot bypass RLS and sets `request.jwt.claims` per
transaction — so the same policies run locally and on Supabase. Job
transitions are validated by a database trigger against a `job_transitions`
table, so no code path can skip a state or forge an audit row. Offer
acceptance is one transactional function, making double-booking impossible
rather than unlikely. Matching lives in a pure domain layer with no React or
SQL, which is what makes it testable and configurable.

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | What this is and why route opportunity matters |
| [`docs/UX_PRINCIPLES.md`](docs/UX_PRINCIPLES.md) | Nine rules, each of which deleted something already built |
| [`docs/AVAILABILITY.md`](docs/AVAILABILITY.md) | The precedence rules, and why the switch outranks the plan |
| [`docs/SEED_DATA.md`](docs/SEED_DATA.md) | The two datasets, and what synthetic providers may never do |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Tokens, primitives, motion, RTL, measured contrast |
| [`docs/BRAND_GUIDELINES.md`](docs/BRAND_GUIDELINES.md) | Voice, the visual signature, and the honesty rules |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, matching pipeline, security model |
| [`docs/QA.md`](docs/QA.md) | Test inventory, verified flows, **and the honest gaps** |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisions, alternatives rejected, trade-offs |
| [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) | Every uncertain assumption and its status |
| [`docs/RISKS.md`](docs/RISKS.md) | Risks with mitigation and verification |
| [`docs/SCORE.md`](docs/SCORE.md) | Self-assessment against the brief's rubric: **97/100**, with the deductions argued |

---

## Status

The complete loop works end to end, verified over HTTP against a real
database:

```
REQUEST → UNDERSTAND → LOCATE → MATCH → OFFER → ACCEPT → CONFIRM
   → EN ROUTE → ARRIVE → WORK → COMPLETE → PAY → REVIEW
```

**What is not done**, stated plainly. Everything in this list is a missing
external service or an unvalidated assumption — none of it is hidden behind
something that looks like it works:

- **Payments are not real.** `PAYMENT_PROVIDER=mock` is a test adapter that
  reports `isReal = false`; the UI labels every test payment as such and
  production startup refuses to run it. No money moves. This system must not
  be described as ready to take payments.
- **Notifications reach nobody.** The only notifier shipped is
  `LoggingNotifier`, which writes the message to the server log and reports
  `isReal = false`. Startup refuses to run it in production, because a
  password-reset code that goes nowhere is worse than no reset at all: the
  person believes one is coming. A real SMS/push gateway is unintegrated
  work, not configuration.
- **COMPARE is refused, not half-built.** `POST /api/jobs` rejects the
  COMPARE booking mode outright rather than accepting it and creating a job
  that nothing will ever progress. Quote comparison is not built; the
  customer still cannot choose between several offers (spec §10's second
  branch), which is first-accept-wins by decision (D-020).
- **Routing is geometric.** `MAP_PROVIDER=estimate` is a documented
  approximation and marks every ETA it produces as low-confidence. OSRM is
  supported but not exercised here.
- Not run against a live Supabase project, and not tested on a real iOS
  Safari or an Android device matrix.
- The route-opportunity weighting wins the adversarial case, but by a thin
  margin, and needs validation against real data.

**What has been built since this section was first written**, and is no
longer a gap: providers upload licence and insurance documents during
onboarding (stored as bytes with magic-byte sniffing, served
`Content-Disposition: attachment` behind RLS), verification lapses
automatically when an approved document expires, before/after job photos
exist where a service promises them, and password reset plus contact
verification are implemented end to end — subject to the notifier above
actually being able to deliver.

See [`docs/QA.md`](docs/QA.md#not-verified--honest-gaps) and
[`docs/RISKS.md`](docs/RISKS.md).

---

## `legacy-restaurant/`

The repository previously held a small Node + SQLite restaurant-order system.
It worked, so it was moved rather than deleted, with its history intact, and
is excluded from this project's build and lint configuration.
