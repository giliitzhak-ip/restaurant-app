import { PrismaClient } from '@sahar/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionStore } from '@/lib/auth/session-store';
import { hashSessionToken } from '@/lib/auth/tokens';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL must be set for integration tests');
const db = new PrismaClient({ datasourceUrl: url });
const store = new SessionStore(db, 30);
const DAY = 24 * 60 * 60 * 1000;

let userId: string;

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: `session-${Date.now()}@test.local`,
      name: 'Session Test',
      passwordHash: 'scrypt$placeholder',
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

describe('SessionStore (real PostgreSQL)', () => {
  it('creates a session that validates to its user, storing only the token hash', async () => {
    const { token, expiresAt } = await store.create(userId, {
      ipAddress: '10.0.0.1',
      userAgent: 'vitest',
    });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);

    const row = await db.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(token) },
    });
    expect(row.tokenHash).not.toBe(token);
    expect(row.ipAddress).toBe('10.0.0.1');

    const result = await store.validate(token);
    expect(result?.user.id).toBe(userId);
    expect(result?.user).not.toHaveProperty('passwordHash');
  });

  it('rejects unknown and malformed tokens', async () => {
    await expect(store.validate('A'.repeat(43))).resolves.toBeNull();
    await expect(store.validate('garbage')).resolves.toBeNull();
    await expect(store.validate(undefined)).resolves.toBeNull();
  });

  it('expires sessions and deletes them on access', async () => {
    const created = new Date(Date.now() - 31 * DAY);
    const { token } = await store.create(userId, {}, created);
    await expect(store.validate(token)).resolves.toBeNull();
    await expect(db.session.count({ where: { tokenHash: hashSessionToken(token) } })).resolves.toBe(
      0,
    );
  });

  it('slides the expiry forward at most once per day', async () => {
    const start = new Date(Date.now() - 2 * DAY);
    const { token, expiresAt } = await store.create(userId, {}, start);

    const sameDay = await store.validate(token, new Date(start.getTime() + 60_000));
    expect(sameDay?.session.expiresAt.getTime()).toBe(expiresAt.getTime());

    const later = new Date();
    const refreshed = await store.validate(token, later);
    expect(refreshed?.session.expiresAt.getTime()).toBe(later.getTime() + 30 * DAY);
  });

  it('revokes a single session and all sessions of a user', async () => {
    const a = await store.create(userId);
    const b = await store.create(userId);
    await store.revoke(a.token);
    await expect(store.validate(a.token)).resolves.toBeNull();
    expect(await store.validate(b.token)).not.toBeNull();

    await store.revokeAllForUser(userId);
    await expect(store.validate(b.token)).resolves.toBeNull();
  });
});
