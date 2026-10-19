import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __saharPrisma?: PrismaClient };

/**
 * Process-wide Prisma client. Reused across Next.js hot reloads in development so the
 * connection pool is not exhausted.
 */
export const prisma: PrismaClient =
  globalForPrisma.__saharPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__saharPrisma = prisma;
}
