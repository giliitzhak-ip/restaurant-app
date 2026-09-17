import { defineConfig } from "prisma/config";

/**
 * Prisma 7 keeps the connection string out of the schema — the CLI reads it
 * from here, and the runtime client builds its own pg adapter in
 * src/server/db/prisma.ts.
 *
 * The fallback keeps `prisma generate` / `prisma validate` working in CI and
 * in checkouts that have no database at all (the app then runs on the
 * in-memory repository). Commands that actually touch a database still
 * require a real DATABASE_URL.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/terranova?schema=public",
  },
});
