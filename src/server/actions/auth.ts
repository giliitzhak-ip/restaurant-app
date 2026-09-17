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

  const session = await signInUser(parsed.data.email, parsed.data.password);
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

  const repository = getRepository();
  const existing = await repository.getUserByEmail(parsed.data.email);
  if (existing) return { ok: false, error: "EMAIL_TAKEN" };

  const user = await repository.createUser({
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
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
