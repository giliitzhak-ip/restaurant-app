import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { getRepository } from "@/server/repositories";
import type { SessionUser } from "@/types/commerce";

/**
 * Session handling.
 *
 * A signed, httpOnly JWT cookie — no external auth service required, and the
 * surface is small enough to swap for Auth.js later: everything the app uses
 * goes through `getSessionUser()` / `createSession()` / `destroySession()`.
 */
const COOKIE = "tn_session";
const GUEST_COOKIE = "tn_guest";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const devSecret = "terra-nova-development-secret-change-me-in-production";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode(devSecret);
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      fullName: String(payload.fullName ?? ""),
      role: payload.role === "ADMIN" ? "ADMIN" : "CUSTOMER",
    };
  } catch {
    // Expired or tampered cookie — treat as a guest.
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

/** Stable token that lets a guest keep their saved designs before signing up. */
export async function getGuestToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_COOKIE)?.value ?? null;
}

export async function ensureGuestToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing) return existing;
  const token = `gst_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  store.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return token;
}

/**
 * A bcrypt hash of a value nobody knows, used to burn the same CPU on a
 * missing account as on a real one. Without it, "no such user" answers in
 * microseconds and "wrong password" takes ~100ms, which is a free account
 * enumeration oracle.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO1rL0XHvJmeQ0VVQfL7Q0R9cEdI8pUzS";

/** Signs in and adopts anything the visitor created while browsing as a guest. */
export async function signInUser(email: string, password: string) {
  const repository = getRepository();
  const user = await repository.getUserByEmail(email);
  if (!user) {
    await compare(password, DUMMY_HASH);
    return null;
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  const session: SessionUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
  await createSession(session);

  const guestToken = await getGuestToken();
  if (guestToken) await repository.claimGuestDesigns(guestToken, user.id);

  return session;
}
