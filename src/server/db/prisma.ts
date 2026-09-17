import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client singleton.
 *
 * Prisma 7 takes the connection through a driver adapter, so the URL lives in
 * the environment only — never in the schema. When DATABASE_URL is missing the
 * app uses the in-memory repository instead, so this module is only ever
 * touched on a configured deployment.
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export function getPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — the Prisma repository is unavailable. " +
        "Set it, or let the app fall back to the in-memory repository.",
    );
  }

  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  }
  return globalForPrisma.__prisma;
}
