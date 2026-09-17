# Data layer

Everything the app reads or writes goes through the `Repository` contract in
[`types.ts`](./types.ts). Two drivers implement it:

| Driver   | When it is used            | Backing store                                 |
| -------- | -------------------------- | --------------------------------------------- |
| `prisma` | `DATABASE_URL` is set      | PostgreSQL (see `prisma/schema.prisma`)       |
| `memory` | `DATABASE_URL` is **not** set | In-process store seeded from `src/data` |

`getRepository()` picks one at first use. Nothing above this folder knows which
driver is live, which is what lets the storefront, the room designer and the
admin panel run end-to-end in a checkout with no database — useful for local
development, CI and preview builds.

Both drivers are fed by the same authored catalogue (`src/data/catalog-seed.ts`
→ `src/data/build-catalog.ts`), so a product looks byte-for-byte the same
whichever driver answered.

## Switching to PostgreSQL

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/terranova?schema=public"
npm run db:push     # or: prisma migrate dev, once migrations are checked in
npm run db:seed
```

## Things to know

- **Prices are never trusted from the client.** `hydrateCart` recomputes every
  line from the live catalogue, so a stale cart cannot underpay.
- **Package rounding lives in one place** (`unitsForArea` in
  `src/server/commerce/pricing.ts`) so the calculator, the cart and the room
  designer can never disagree about how many boxes 12.8 m² needs.
- **Availability is derived**, not stored: `availabilityFor()` maps stock,
  lead time and the quote-only flag onto the badge the UI shows. The Prisma
  driver translates availability filters back into stock predicates.
- **Facets** are computed with one pass over the active catalogue. At a few
  thousand products, swap `getFacets()` for `groupBy` queries.
- The in-memory store hangs off `globalThis` so a cart survives a hot reload.

## Demo accounts (memory driver only)

| Email                      | Password        | Role     |
| -------------------------- | --------------- | -------- |
| `admin@terranova.example`  | `TerraNova!2026`| ADMIN    |
| `noa@example.com`          | `Demo!2026`     | CUSTOMER |

With PostgreSQL the same two accounts are created by `prisma/seed.ts`; set
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` to override the admin one.
