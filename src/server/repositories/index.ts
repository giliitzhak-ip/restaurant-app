import { isProduction, isServingProduction } from "@/config/env";
import { hasDatabase } from "@/server/db/prisma";
import { memoryRepository } from "./memory";
import { prismaRepository } from "./prisma";
import type { Repository } from "./types";

/**
 * Picks the data driver once per process.
 *
 * `DATABASE_URL` set  → PostgreSQL through Prisma (production).
 * `DATABASE_URL` unset → in-memory store seeded from src/data (local dev, CI,
 * preview builds). Both implement the same `Repository` contract, so nothing
 * above this line knows or cares which one is live.
 *
 * Production may only use Prisma. The memory driver holds orders, accounts and
 * saved designs in a process-local map: it loses every one of them on restart
 * and disagrees with itself across instances. Serving real customers from it
 * would be silent data loss, so this throws instead.
 */
let active: Repository | null = null;

export function getRepository(): Repository {
  if (!active) {
    if (isServingProduction && !hasDatabase) {
      throw new Error(
        "DATABASE_URL is required in production — refusing to serve from the in-memory repository.",
      );
    }
    active = hasDatabase ? prismaRepository : memoryRepository;
    if (!isProduction) {
      console.info(`[data] repository driver: ${active.driver}`);
    }
  }
  return active;
}

export type { Repository } from "./types";
