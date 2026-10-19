import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/http";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError("בקשה לא מורשית", 403);
  await destroySession();
  return NextResponse.json({ ok: true });
}
