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
 */
let active: Repository | null = null;

export function getRepository(): Repository {
  if (!active) {
    active = hasDatabase ? prismaRepository : memoryRepository;
    if (process.env.NODE_ENV !== "production") {
      console.info(`[data] repository driver: ${active.driver}`);
    }
  }
  return active;
}

export type { Repository } from "./types";
