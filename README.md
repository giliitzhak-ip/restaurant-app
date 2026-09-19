# Terra Nova — Digital Showroom

A production-grade e-commerce storefront for **parquet, wall cladding, decorative
panels and complementary products**, built around one idea:

> **DISCOVER → VISUALIZE → DESIGN → CALCULATE → BUY**

The differentiator is not the catalogue — it is that a customer can photograph
their own room, drop a **real product texture** into it in correct perspective,
work out how many packages they need, and check out. Hebrew-first, RTL
throughout, mobile-first.

> **Branding note.** `Terra Nova`, the phone numbers, the address and the logo
> files are deliberate placeholders. Everything a client would want to replace
> lives in [`src/config/brand.ts`](src/config/brand.ts),
> [`public/brand/`](public/brand) and the media pipeline — no component change
> required.

---


## Before production

The app refuses to start in production without a complete environment — see
`.env.example` for which variables are required and `docs/SECURITY.md` for why
each one is. In short: a database, a real `AUTH_SECRET`, an https site URL,
remote object storage and a Redis endpoint for rate limiting.

```bash
npm ci
npm run media:generate     # generated imagery; not in git, not part of the build
npm run db:migrate         # or db:push for a throwaway database
SEED_MODE=production npm run db:seed
npm run build && npm start
```

Payments are **not** ready to take money: no gateway is wired up, and the
webhook — the only thing that may mark an order paid — refuses every callback
until `PAYMENT_WEBHOOK_SECRET` is set and the provider's format is implemented
in `src/server/payments/hosted-gateway.ts`. Run the provider's sandbox through
a capture, a decline, a cancellation and a replayed callback before going live.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
npm run assets:check       # generated media against its size budget
npm test                   # Playwright: shop, auth, quotes, designer, security, axe
```

## Quick start

```bash
npm install            # also runs `prisma generate`
npm run dev            # generates placeholder media on first run, then serves :3000
```

That is the whole setup. **No database and no API keys are required to run the
app** — it falls back to an in-memory repository and a local vision provider
(details below). Sign in with the seeded demo accounts:

| Email                     | Password         | Role     |
| ------------------------- | ---------------- | -------- |
| `admin@terranova.example` | `TerraNova!2026` | ADMIN    |
| `noa@example.com`         | `Demo!2026`      | CUSTOMER |

### With PostgreSQL

```bash
cp .env.example .env
# set DATABASE_URL and AUTH_SECRET
npm run db:push
npm run db:seed
npm run dev
```

The admin header shows which data driver is live (`prisma` or `memory`).

---

## What is built

### Storefront
- **Homepage** — hero, value bar, category grid, room-designer teaser, featured
  collections, best sellers, before/after slider, new arrivals, inspiration,
  customer projects, reviews, FAQ, consultation CTA.
- **Catalogue** — one surface shared by `/catalog`, `/{category}` and
  `/collections/{slug}`. 14 working facet groups (category, surface, tone,
  colour, material, style, size, thickness, price per m², water resistance,
  indoor/outdoor, availability, collection, brand), 4 sort orders, pagination,
  removable filter chips, desktop sidebar and mobile bottom sheet. **Filter
  state lives in the URL**, so results are server-rendered, shareable and
  back-button friendly.
- **Product page** — gallery, price per m² *and* per package, availability with
  real lead times, full spec table, installation and maintenance, reviews,
  related and same-collection rails, "see it in my room", sample ordering.
- **Quantity calculator** — multiple rooms, by dimensions or by area, 5/10/15 %
  waste allowance, whole-package rounding, add-to-cart from the calculation.
- **Cart & checkout** — m²/package aware lines, coupons, installation add-on,
  shipping vs. pickup, free-shipping progress, validated checkout, order
  confirmation. **Prices are always recomputed server-side from the catalogue.**
- **Quotes** — for project pricing, with optional photo upload or an
  automatically attached room design.
- **Account** — saved designs (rename / duplicate / delete / delete photo / add
  to cart), orders, quotes, favourites, profile.
- **Admin** — dashboard, product CRUD (including the designer texture and its
  real-world dimensions), inventory, orders, quotes, saved designs, categories,
  collections, coupons, reviews, customers.

### Room designer (`/designer`)
See [docs/ROOM_DESIGNER.md](docs/ROOM_DESIGNER.md). In short:

- camera capture with framing guidance, file upload, or a demo room;
- provider-agnostic segmentation (`RoomVisionProvider`) — a local heuristic
  provider ships by default, a hosted model is one env var away;
- a browser render engine that maps the photo to real centimetres, tiles the
  **actual product texture**, keeps windows and furniture on top, and preserves
  the room's own light and shadow;
- floor and wall flows, several walls at once, manual mask marking and area
  exclusion, orientation / scale / brightness / alignment / row-stagger
  controls, before-after slider, estimated m² and price, save design, add to
  cart, quote hand-off.

---

## Stack

| Concern    | Choice |
| ---------- | ------ |
| Framework  | Next.js 16 (App Router, server actions), React 19, TypeScript strict |
| Styling    | Tailwind CSS v4 with design tokens in `src/app/globals.css` |
| UI         | Hand-written component library on Radix primitives (shadcn-style) |
| Motion     | Framer Motion, only where it earns its place (toasts) |
| Data       | PostgreSQL + Prisma 7, with an in-memory driver behind the same contract |
| Validation | Zod on every server action |
| Forms      | React Hook Form where a form is complex, plain actions elsewhere |
| Auth       | Signed httpOnly JWT sessions (`jose` + `bcryptjs`) |
| Payments   | Provider interface + `manual` and hosted-gateway adapters |
| Storage    | Driver interface + local disk and signed-endpoint drivers |

---

## Project structure

```
src/
  app/                  routes (store group, /designer, /admin, sitemap, robots)
  components/           chrome + UI primitives
  config/               brand, commerce and designer configuration
  data/                 authored catalogue, texture recipes, editorial content
  features/
    catalog/            cards, filters, calculator, labels
    cart/  checkout/    cart state and checkout form
    room-designer/      components · hooks · engine · providers · utils
    quotes/ account/ admin/ legal/ home/
  i18n/                 locale registry + Hebrew dictionary
  lib/                  utils, formatting, media paths, SEO, analytics
  server/
    actions/            server actions (all Zod-validated)
    auth/ cart/ commerce/ db/ payments/ repositories/ storage/
  types/                domain types shared by DB, API and UI
prisma/                 schema + seed
scripts/                media generation, responsive QA
docs/                   architecture, media, privacy, designer
```

---

## Internationalisation

Hebrew (RTL) is the shipped locale. Every user-facing string lives in
[`src/i18n/dictionaries/he.ts`](src/i18n/dictionaries/he.ts) and components read
it through a **typed** dictionary (`t.cart.checkout`), so a missing key is a
compile error. Adding English, Arabic or Russian is:

1. create `dictionaries/en.ts` with `satisfies Dictionary`;
2. register it in `src/i18n/index.ts` and add the locale to `activeLocales`;
3. add the `[locale]` segment in the app router and read the dictionary from
   context instead of the default export.

No component changes are required. Direction comes from `localeMeta`, and all
layout uses logical properties (`ms-`, `pe-`, `start-`, `end-`) rather than
left/right.

---

## Environment

Everything is optional for local development — see
[`.env.example`](.env.example) for the full list with comments.

| Variable | Effect when unset |
| -------- | ----------------- |
| `DATABASE_URL` | in-memory repository (seeded from `src/data`) |
| `AUTH_SECRET` | development-only signing key (required in production) |
| `ROOM_VISION_PROVIDER` | local heuristic segmentation |
| `STORAGE_DRIVER` | uploads written to `public/uploads` |
| `PAYMENT_PROVIDER` | `manual` — order recorded, paid offline |
| `NEXT_PUBLIC_ANALYTICS_DRIVER` | console in dev, no-op in production |
| `MAINTENANCE_TOKEN` | retention endpoint refuses to run |

---

## Quality gates

```bash
npm run lint         # eslint (next/core-web-vitals + typescript + react-hooks)
npm run typecheck    # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run build        # next build
npm run qa           # all three
```

Two Playwright scripts cover the rest (they need a running server):

```bash
npx playwright install chromium   # once
npm run dev -- -p 3100

npm run qa:responsive   # 375 / 430 / 768 / 1440: status, dir, console errors,
                        # and horizontal overflow with the offending element
npm run qa:flows        # home → filter → product → calculator → cart → coupon
                        # → checkout → order, quote, designer (analyse, apply,
                        # save, add to cart), admin login → product edit
```

`qa:flows` writes real records, so point it at a throwaway environment. Both
were run against the in-memory driver **and** a live PostgreSQL 16 instance,
with identical results and no console errors.

### Deployment

Any Node host that runs `next start` (Vercel, Fly, a container) works:

1. set `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`;
2. `npm ci && npm run build` (the build generates placeholder media and the
   Prisma client);
3. run `prisma migrate deploy` (or `db push` for a first deploy) and
   `npm run db:seed` once;
4. point `STORAGE_DRIVER=remote` at a bucket so uploads survive redeploys;
5. schedule `POST /api/maintenance/retention` daily with `MAINTENANCE_TOKEN`.

---

## Placeholder media

`public/media` is **generated, not committed**. `npm run media:generate`
procedurally renders seamless product textures and perspective interior scenes
from the recipes in `src/data`. Replacing a placeholder with real photography
means dropping a file in place or pointing the record at a CDN URL — see
[docs/MEDIA.md](docs/MEDIA.md).

---

## Privacy

Room photos are the most sensitive thing this app touches, so the defaults are
conservative: the visualisation runs in the browser, only a thumbnail is sent
for segmentation, the full photo is stored **only** when the customer saves a
design, retention is configurable, deletion is one click, and photos are never
used to train models. Details and the retention job:
[docs/PRIVACY.md](docs/PRIVACY.md).

---

## Where to go next

Deliberately **not** built yet, but the architecture leaves room for each:
live AR camera, automatic room measurement, 3D room models, an AI "design my
room" style picker (choosing only from real stock), installer marketplace,
architect/contractor accounts and wholesale pricing, WhatsApp and CRM
integrations. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#future-ready).
