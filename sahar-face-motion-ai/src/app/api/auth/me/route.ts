import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("לא מחובר", 401);
  return NextResponse.json({ ok: true, user });
}
