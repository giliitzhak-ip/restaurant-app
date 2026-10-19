import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAgainstDummy, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, isSameOrigin, jsonError } from "@/lib/http";
import { firstError, loginSchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError("בקשה לא מורשית", 403);
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { email, password } = parsed.data;

  const ip = clientIp(req);
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 30, 900),
    rateLimit(`login:email:${email}`, 8, 900),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    const wait = Math.ceil(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec) / 60);
    return jsonError(`יותר מדי ניסיונות התחברות. נסו שוב בעוד ${wait} דקות.`, 429);
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
  if (!user || !valid) return jsonError("האימייל או הסיסמה שגויים", 401);

  await createSession(user.id, { userAgent: req.headers.get("user-agent"), ip });
  return NextResponse.json({ ok: true });
}
