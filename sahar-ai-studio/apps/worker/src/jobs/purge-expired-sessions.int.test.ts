import { PrismaClient } from '@sahar/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeExpiredSessions } from './purge-expired-sessions';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL must be set for integration tests');
const db = new PrismaClient({ datasourceUrl: url });

describe('purgeExpiredSessions', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        email: `purge-${Date.now()}@test.local`,
        name: 'Purge Test',
        passwordHash: 'scrypt$x',
        termsAcceptedAt: new Date(),
        termsVersion: 'test',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it('removes only expired sessions', async () => {
    const now = new Date();
    await db.session.createMany({
      data: [
        { userId, tokenHash: `expired-${Date.now()}`, expiresAt: new Date(now.getTime() - 1_000) },
        { userId, tokenHash: `live-${Date.now()}`, expiresAt: new Date(now.getTime() + 60_000) },
      ],
    });
    await purgeExpiredSessions(db, now);
    const remaining = await db.session.findMany({ where: { userId } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.tokenHash.startsWith('live-')).toBe(true);
  });
});
