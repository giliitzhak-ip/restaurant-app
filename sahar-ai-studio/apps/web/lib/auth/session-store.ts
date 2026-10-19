import type { PrismaClient, Session, User } from '@sahar/db';
import { generateSessionToken, hashSessionToken, isWellFormedToken } from './tokens';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sliding expiry is extended at most once per this interval to avoid a write per request. */
const REFRESH_INTERVAL_MS = DAY_MS;

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'locale' | 'role' | 'createdAt'>;

export interface SessionMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ValidatedSession {
  session: Pick<Session, 'id' | 'expiresAt'>;
  user: SessionUser;
}

/** Database-side session operations. Free of Next.js APIs so it can be integration-tested. */
export class SessionStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly ttlDays: number,
  ) {}

  private ttlMs() {
    return this.ttlDays * DAY_MS;
  }

  async create(userId: string, meta: SessionMeta = {}, now = new Date()) {
    const token = generateSessionToken();
    const expiresAt = new Date(now.getTime() + this.ttlMs());
    await this.db.session.create({
      data: {
        userId,
        tokenHash: hashSessionToken(token),
        expiresAt,
        lastSeenAt: now,
        ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      },
    });
    return { token, expiresAt };
  }

  async validate(token: string | undefined, now = new Date()): Promise<ValidatedSession | null> {
    if (!isWellFormedToken(token)) return null;
    const row = await this.db.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: {
        id: true,
        expiresAt: true,
        lastSeenAt: true,
        user: {
          select: { id: true, email: true, name: true, locale: true, role: true, createdAt: true },
        },
      },
    });
    if (!row) return null;

    if (row.expiresAt.getTime() <= now.getTime()) {
      await this.db.session.deleteMany({ where: { id: row.id } });
      return null;
    }

    let expiresAt = row.expiresAt;
    if (now.getTime() - row.lastSeenAt.getTime() >= REFRESH_INTERVAL_MS) {
      expiresAt = new Date(now.getTime() + this.ttlMs());
      await this.db.session.update({
        where: { id: row.id },
        data: { lastSeenAt: now, expiresAt },
      });
    }

    return { session: { id: row.id, expiresAt }, user: row.user };
  }

  async revoke(token: string | undefined): Promise<void> {
    if (!isWellFormedToken(token)) return;
    await this.db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const { count } = await this.db.session.deleteMany({ where: { userId } });
    return count;
  }
}
