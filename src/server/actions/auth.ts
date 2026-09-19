"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/config/site";
import {
  createSession,
  destroySession,
  ensureGuestToken,
  hashPassword,
  signInUser,
} from "@/server/auth/session";
import { attachCartToUser } from "@/server/cart/cart-service";
import { getRepository } from "@/server/repositories";
import { rateLimit } from "@/server/security/rate-limit";
import { log } from "@/server/observability/logger";

const credentials = z.object({
  email: z.string().trim().email("אימייל לא תקין"),
  password: z.string().min(8, "סיסמה של 8 תווים לפחות"),
});

const registration = credentials.extend({
  fullName: z.string().trim().min(2, "נדרש שם מלא"),
  phone: z.string().trim().optional(),
});

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const parsed = credentials.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  /*
   * Limited per address *and* per client, so neither spraying one password
   * across many accounts nor grinding one account goes unnoticed.
   */
  const email = parsed.data.email.toLowerCase();
  const perAccount = await rateLimit("login", email);
  const perClient = await rateLimit("login");
  if (!perAccount.ok || !perClient.ok) {
    log.warn("auth.login_rate_limited", {});
    return { ok: false, error: "RATE_LIMITED" };
  }

  const session = await signInUser(email, parsed.data.password);
  // One message for "no such account" and for "wrong password": the difference
  // between them is exactly what an attacker is trying to learn.
  if (!session) return { ok: false, error: "INVALID_CREDENTIALS" };

  await attachCartToUser(session.id);
  revalidatePath(routes.account.root);
  return { ok: true };
}

export async function registerAction(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}): Promise<AuthResult> {
  const parsed = registration.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const limited = await rateLimit("register");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

  const repository = getRepository();
  const email = parsed.data.email.toLowerCase();
  const existing = await repository.getUserByEmail(email);

  /*
   * The password is hashed either way, so a taken address does not answer
   * faster than a free one, and the error is deliberately vague.
   *
   * This narrows enumeration; it does not close it, because a signup form that
   * refuses a duplicate always tells you something. Closing it properly means
   * always answering "check your inbox" and doing the real work in a verified
   * email — that needs a mail provider, which this app does not have yet.
   * Documented in docs/SECURITY.md.
   */
  const passwordHash = await hashPassword(parsed.data.password);
  if (existing) {
    log.info("auth.register_duplicate", {});
    return { ok: false, error: "REGISTRATION_REJECTED" };
  }

  const user = await repository.createUser({
    email,
    passwordHash,
    fullName: parsed.data.fullName,
    phone: parsed.data.phone?.trim() ? parsed.data.phone.trim() : null,
  });

  await createSession({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });

  // Anything designed as a guest becomes theirs.
  const guestToken = await ensureGuestToken();
  await repository.claimGuestDesigns(guestToken, user.id);
  await attachCartToUser(user.id);

  revalidatePath(routes.account.root);
  return { ok: true };
}

export async function logoutAction() {
  await destroySession();
  revalidatePath("/");
}
