import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { parseRange } from "@/server/media/range";
import { storage } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_TYPES: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", m4a: "audio/mp4" };

/**
 * Streams a private asset to its owner. Supports HTTP Range requests, which
 * iPhone Safari requires for <video> playback and seeking.
 * ?v=original|preview|poster|face(&n=index)  &download=1 for an attachment.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser(req);
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const variant = url.searchParams.get("v") ?? "original";

  const asset = await db.asset.findFirst({ where: { id: (await params).id, ownerId: auth.user.id } });
  if (!asset) return jsonError("הקובץ לא נמצא", 404);

  let key: string | null;
  let contentType: string;
  if (variant === "preview") {
    key = asset.previewKey;
    contentType = PREVIEW_TYPES[key?.split(".").pop() ?? ""] ?? "application/octet-stream";
  } else if (variant === "poster") {
    key = asset.posterKey;
    contentType = "image/jpeg";
  } else if (variant === "face") {
    // Thumbnail of a detected person: ?v=face&n=<index>
    const faces = asset.faces as { status?: string; persons?: { index: number; thumb: string }[] } | null;
    const person = faces?.status === "ok" ? faces.persons?.find((p) => p.index === Number(url.searchParams.get("n"))) : undefined;
    key = person ? asset.storageKey.replace(/original\.[^/]+$/, `faces/${person.thumb}`) : null;
    contentType = "image/jpeg";
  } else if (variant === "original") {
    key = asset.status === "REJECTED" ? null : asset.storageKey;
    contentType = asset.mimeType;
  } else {
    return jsonError("גרסת קובץ לא מוכרת", 400);
  }
  if (!key) return jsonError("הקובץ עדיין לא זמין", 404);

  const total = await storage().size(key);
  if (total === null) return jsonError("הקובץ לא נמצא באחסון", 404);

  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (url.searchParams.get("download") === "1") {
    const base = (asset.originalName ?? "file").replace(/\.[^.]+$/, "");
    const ext = key.split(".").pop();
    const name = `${base}${variant === "original" ? "" : `-${variant}`}.${ext}`;
    headers.set("Content-Disposition", `attachment; filename="download.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  }

  const rangeHeader = req.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, total) : null;
  if (rangeHeader && range === "invalid") {
    headers.set("Content-Range", `bytes */${total}`);
    return new Response(null, { status: 416, headers });
  }
  const obj = await storage().get(key, range && range !== "invalid" ? range : undefined);
  if (!obj) return jsonError("הקובץ לא נמצא באחסון", 404);
  const body = Readable.toWeb(obj.body) as ReadableStream;

  if (range && range !== "invalid") {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(body, { status: 206, headers });
  }
  headers.set("Content-Length", String(total));
  return new Response(body, { status: 200, headers });
}
