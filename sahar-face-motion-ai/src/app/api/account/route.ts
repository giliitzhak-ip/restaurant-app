import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { isSameOrigin, jsonError } from "@/lib/http";
import { keys, storage } from "@/server/storage";

/**
 * Permanently deletes the account, every row that belongs to it (cascade) and
 * every stored file under the user's storage prefix. From phase 4 this also
 * deletes cloned voices at the provider.
 */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return jsonError("בקשה לא מורשית", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("לא מחובר", 401);

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof body?.password !== "string") return jsonError("יש להזין סיסמה לאישור המחיקה", 400);
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(body.password, row.passwordHash))) return jsonError("הסיסמה שגויה", 401);

  await db.user.delete({ where: { id: user.id } });
  await storage()
    .deletePrefix(keys.user(user.id))
    .catch((e) => console.error("account storage purge failed", user.id, e));
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
