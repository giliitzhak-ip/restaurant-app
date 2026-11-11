import { NextResponse, type NextRequest } from "next/server";
import { runTick } from "@/lib/agent";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds (Vercel caps this by plan)

/**
 * Called by the scheduler (Supabase pg_cron every 10 min, and Vercel Cron daily as a backup).
 * Auth: "Authorization: Bearer <CRON_SECRET>". Vercel Cron sends this header automatically.
 */
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret()}`;
  if (!safeEqual(auth, expected)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const trigger = req.headers.get("user-agent")?.includes("vercel-cron") ? "vercel_cron" : "external_cron";
  const summary = await runTick(trigger);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
