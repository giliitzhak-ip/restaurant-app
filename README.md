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
| `npm test` | All 152 tests |
| `npm run test:unit` · `test:integration` · `test:security` | One suite |
| `npm run db:roles` · `db:migrate` · `db:seed` · `db:setup` | Database |
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
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, matching pipeline, security model |
| [`docs/QA.md`](docs/QA.md) | Test inventory, verified flows, **and the honest gaps** |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisions, alternatives rejected, trade-offs |
| [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) | Every uncertain assumption and its status |
| [`docs/RISKS.md`](docs/RISKS.md) | Risks with mitigation and verification |

---

## Status

The complete loop works end to end, verified over HTTP against a real
database:

```
REQUEST → UNDERSTAND → LOCATE → MATCH → OFFER → ACCEPT → CONFIRM
   → EN ROUTE → ARRIVE → WORK → COMPLETE → PAY → REVIEW
```

**What is not done**, stated plainly: the customer cannot choose between
several offers (spec §10's second branch) and the COMPARE booking mode is a
dead end; provider documents cannot be uploaded; no real payment gateway is
integrated
(the mock reports `isReal = false` and the UI labels test payments as such);
this has not been run against a live Supabase project; no push notifications;
and the route-opportunity weighting, while it wins the adversarial case, wins
it by a thin margin and needs validation against real data.
See [`docs/QA.md`](docs/QA.md#not-verified--honest-gaps) and
[`docs/RISKS.md`](docs/RISKS.md).

---

## `legacy-restaurant/`

The repository previously held a small Node + SQLite restaurant-order system.
It worked, so it was moved rather than deleted, with its history intact, and
is excluded from this project's build and lint configuration.
