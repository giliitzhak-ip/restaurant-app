"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { safeEqual, verifyPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

const MAX_FAILS = 8;
const WINDOW_MIN = 15;

export async function login(
  _prev: { error?: string; email?: string } | undefined,
  form: FormData,
): Promise<{ error?: string; email?: string }> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Simple brute-force protection: global failure budget per 15 minutes.
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await db()
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("event", "auth.fail")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_FAILS) return { error: `יותר מדי ניסיונות. נסו שוב בעוד ${WINDOW_MIN} דקות.`, email };

  const okEmail = safeEqual(email, env.adminEmail().trim().toLowerCase());
  const okPass = verifyPassword(password, env.adminPasswordHash());
  if (!okEmail || !okPass) {
    await log("warn", "auth.fail", "ניסיון התחברות כושל", { meta: { ip } });
    return { error: "אימייל או סיסמה שגויים", email };
  }
  await createSession(email);
  await log("info", "auth.login", "מנהל התחבר", { meta: { ip } });
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
