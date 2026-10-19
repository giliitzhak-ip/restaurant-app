import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, isSameOrigin, jsonError } from "@/lib/http";
import { firstError, registerSchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError("בקשה לא מורשית", 403);
  const ip = clientIp(req);
  const rl = await rateLimit(`register:${ip}`, 5, 3600);
  if (!rl.allowed) return jsonError("נוצרו יותר מדי חשבונות מכתובת זו. נסו שוב מאוחר יותר.", 429);

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { name, email, password } = parsed.data;

  try {
    const user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password), termsAcceptedAt: new Date() },
      select: { id: true },
    });
    await createSession(user.id, { userAgent: req.headers.get("user-agent"), ip });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError("כתובת האימייל כבר רשומה במערכת", 409);
    }
    console.error("register failed", e);
    return jsonError("אירעה שגיאה ביצירת החשבון. נסו שוב.", 500);
  }
}
