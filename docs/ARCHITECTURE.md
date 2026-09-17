# Architecture

## Principles

1. **Minimum complexity, maximum clarity.** Every abstraction here exists
   because something concrete needed it — a second data driver so the app runs
   without PostgreSQL, a payment interface because the Israeli gateway is not
   chosen yet, a vision provider interface because the segmentation model will
   change. Nothing is abstracted "just in case".
2. **The server owns the truth.** Prices, package rounding, discounts and stock
   are recomputed server-side on every read. A stale client cannot underpay.
3. **One source for content.** The catalogue is authored once
   (`src/data/catalog-seed.ts`) and consumed by the database seed, the
   in-memory driver and the media generator.
4. **URL as state.** Catalogue filters, designer deep links and pagination live
   in the URL, so everything is server-rendered, shareable and cacheable.

## Layers

```
        route (server component)
                 │  reads
                 ▼
        getRepository()  ──►  prisma driver  ──►  PostgreSQL
                 │            memory driver  ──►  in-process store
                 ▼
        server actions (Zod)  ──►  pricing · auth · storage · payments · vision
                 │
                 ▼
        client features (cart, favourites, designer, admin forms)
```

- **`src/server/repositories`** — the only data contract
  ([README](../src/server/repositories/README.md)). Two drivers, identical
  behaviour, selected by `DATABASE_URL`.
- **`src/server/commerce/pricing.ts`** — package rounding, coupons, shipping,
  installation, cart hydration. The single place where money is calculated.
- **`src/server/actions/*`** — every mutation, each one Zod-validated and, for
  admin, guarded with `requireAdmin()` inside the action (server actions are
  public endpoints; a guarded layout is not enough).
- **`src/server/payments`**, **`src/server/storage`**,
  **`src/features/room-designer/providers`** — swappable adapters, chosen by
  environment variable, each with a working default.

## Data model notes

- **Availability is derived**, never stored: `availabilityFor()` maps stock,
  lead time and the quote-only flag to the badge. The Prisma driver translates
  availability filters back into stock predicates so filtering stays in SQL.
- **`ProductTexture` is a first-class model.** `widthCm`/`heightCm` are the
  real-world footprint of the whole texture image and `repeatX`/`repeatY` count
  the product units inside it. The renderer needs the footprint; the admin UI
  shows the unit counts. Getting this wrong is the main way a visualiser ends
  up with 40 cm planks.
- **`RoomDesign` + `RoomSurface`** store normalised masks and per-surface
  settings as JSON, so a saved design can be reopened and edited at any
  resolution.
- **Cart lines** keep `requestedSqm` (what the customer asked for) next to the
  purchased units, which is what makes "you asked for 12.8 m², that is 6 boxes
  = 13.38 m²" explainable at checkout.

## Rendering strategy

Pages are server-rendered on demand. The root layout reads the cart and session
cookies, which makes routes dynamic by design — correct for a commerce app, and
cheap because the data layer answers in well under a millisecond in memory and
a single indexed query set on PostgreSQL. Images are the real cost centre, and
they are handled with `next/image`, AVIF/WebP, explicit `sizes`, blur
placeholders and lazy loading everywhere below the fold.

If static shells become worthwhile for category and product pages, the change
is local: move the cookie-dependent header into a Suspense island and enable
partial prerendering for those routes. Nothing else needs to change.

## Accessibility

- Semantic landmarks, a skip link, and `aria-label`s on every icon-only control.
- Focus is always visible (`:focus-visible` outline in the brass accent).
- Radix primitives handle dialog/sheet focus traps and keyboard behaviour.
- The before/after slider is a real `input[type=range]`, so it works with a
  keyboard and a screen reader, not just a mouse drag.
- Live regions on the calculator result and the designer's render status.
- `prefers-reduced-motion` disables every transition and animation.

## Future ready

| Direction | What is already in place |
| --------- | ------------------------ |
| Live AR camera | Camera capture, mask model and render settings are already separate from the still-image flow |
| Automatic room measurement | `buildSurfacePlane` isolates the one calibration number a measurement would replace |
| 3D room models | Surfaces are stored as geometry + settings, not as baked pixels |
| "Design my room" style picker | Products carry tone/style/material tags; a style map selects from real stock only |
| Installer marketplace, architect and contractor accounts | `User.role` and the quote pipeline are the extension points |
| Wholesale pricing | Pricing is one module; a per-role price list slots in behind `hydrateCart` |
| WhatsApp / CRM | Quotes and orders are already normalised records with a single creation path |
