import { Readable } from "node:stream";
import { jsonError } from "@/lib/http";
import { storage } from "@/server/storage";
import { verifyLocalKey } from "@/server/storage/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v", jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4" };

/**
 * Time-limited, HMAC-signed download for external AI providers when the
 * local storage driver is used (S3 uses its own pre-signed URLs instead).
 */
export async function GET(req: Request) {
  const key = verifyLocalKey(new URL(req.url).searchParams);
  if (!key) return jsonError("קישור לא תקף או שפג תוקפו", 403);
  const obj = await storage().get(key);
  if (!obj) return jsonError("הקובץ לא נמצא", 404);
  return new Response(Readable.toWeb(obj.body) as ReadableStream, {
    headers: {
      "Content-Type": TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Content-Length": String(obj.size),
      "Cache-Control": "private, no-store",
    },
  });
}
