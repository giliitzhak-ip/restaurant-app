import type { PrismaClient } from '@sahar/db';

/** Deletes sessions whose expiry has passed. Safe to run concurrently and repeatedly. */
export async function purgeExpiredSessions(db: PrismaClient, now = new Date()): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}
