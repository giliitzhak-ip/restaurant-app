import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "sfm_session";
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string; name: string; role: "USER" | "ADMIN" };

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: meta.userAgent?.slice(0, 300), ip: meta.ip },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure only when served over HTTPS; plain-HTTP LAN testing on iPhone would otherwise drop the cookie.
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Current user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
});

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}
