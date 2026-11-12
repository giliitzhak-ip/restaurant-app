import { NextResponse } from "next/server";
import { missingConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Public health check. Reports only whether config exists — never values. */
export async function GET() {
  const missing = missingConfig();
  return NextResponse.json({ ok: missing.length === 0, missingConfig: missing, time: new Date().toISOString() });
}
