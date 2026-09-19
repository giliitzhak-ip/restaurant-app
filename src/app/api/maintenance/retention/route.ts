import { NextResponse } from "next/server";
import { getRepository } from "@/server/repositories";
import { removeStoredImage } from "@/server/storage";
import { timingSafeEqualString } from "@/server/security/tokens";
import { log, captureError } from "@/server/observability/logger";

/**
 * Privacy retention job.
 *
 * Deletes room designs (and therefore the uploaded photos attached to them)
 * whose retention window has passed — 7 days for guests, a year for signed-in
 * customers by default (see src/config/brand.ts).
 *
 * Call it from a scheduler:
 *   curl -X POST -H "authorization: Bearer $MAINTENANCE_TOKEN" https://…/api/maintenance/retention
 *
 * POST only. A destructive job behind GET is one prefetch, one crawler or one
 * `<img>` tag away from running by accident, and browsers happily follow GETs
 * cross-origin. The token is compared in constant time so the endpoint cannot
 * be used as a character-by-character oracle.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = process.env.MAINTENANCE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "MAINTENANCE_TOKEN is not configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqualString(provided, token)) {
    log.warn("maintenance.retention.unauthorised", {});
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const { removed, imageUrls } = await getRepository().purgeExpiredDesigns();
    // Delete the files as well as the rows: a deleted row with the bytes still
    // on disk is not a deletion, it is a broken promise.
    let files = 0;
    for (const url of imageUrls) {
      await removeStoredImage(url);
      files += 1;
    }
    log.info("maintenance.retention.done", { removed, files });
    return NextResponse.json({ ok: true, removed, files });
  } catch (error) {
    await captureError(error, { route: "maintenance.retention" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
