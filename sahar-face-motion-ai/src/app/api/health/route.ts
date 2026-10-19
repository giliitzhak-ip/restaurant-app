import { NextResponse } from "next/server";
import { systemStatus } from "@/server/system-status";

export const dynamic = "force-dynamic";

/** Liveness/readiness for deploy probes. Reports only booleans publicly. */
export async function GET() {
  const { checks } = await systemStatus();
  const ok = checks.database.ok && checks.queue.ok;
  return NextResponse.json(
    { ok, database: checks.database.ok, queue: checks.queue.ok, ffmpeg: checks.ffmpeg.ok, ffprobe: checks.ffprobe.ok },
    { status: ok ? 200 : 503 },
  );
}
