import { NextResponse } from "next/server";
import { getRepository } from "@/server/repositories";
import { removeStoredImage } from "@/server/storage";

/**
 * Privacy retention job.
 *
 * Deletes room designs (and therefore the uploaded photos attached to them)
 * whose retention window has passed — 7 days for guests, a year for signed-in
 * customers by default (see src/config/brand.ts).
 *
 * Call it from a scheduler:
 *   curl -H "authorization: Bearer $MAINTENANCE_TOKEN" https://…/api/maintenance/retention
 *
 * Without MAINTENANCE_TOKEN set the route refuses to run, so it cannot be
 * triggered by accident in production.
 */
export async function POST(request: Request) {
  const token = process.env.MAINTENANCE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "MAINTENANCE_TOKEN is not configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== token) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { removed, imageUrls } = await getRepository().purgeExpiredDesigns();
  // Delete the files as well as the rows.
  for (const url of imageUrls) await removeStoredImage(url);
  return NextResponse.json({ ok: true, removed, files: imageUrls.length });
}

export const GET = POST;
