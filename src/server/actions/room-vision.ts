"use server";

import { z } from "zod";
import { designerConfig } from "@/config/brand";
import { rateLimit } from "@/server/security/rate-limit";
import { sniffImageFormat } from "@/server/security/images";
import { log } from "@/server/observability/logger";
import {
  getVisionProvider,
  providerNeedsFullImage,
} from "@/features/room-designer/providers";
import type { RoomAnalysis } from "@/types/design";

const previewSchema = z.object({
  width: z.number().int().positive().max(512),
  height: z.number().int().positive().max(512),
  rgba: z.array(z.number().int().min(0).max(255)),
});

export type AnalyzeResult =
  | { ok: true; analysis: RoomAnalysis; needsFullImage: boolean }
  | { ok: false; error: "INVALID_INPUT" | "PROVIDER_FAILED" | "RATE_LIMITED" };

/**
 * Analyses a room photo.
 *
 * The browser sends a small RGBA preview (a few kilobytes) plus the image
 * dimensions. The full-resolution photo is only included when the configured
 * provider actually needs it, and it is never written to disk here — storage
 * happens only when the customer chooses to save the design.
 */
export async function analyzeRoomAction(formData: FormData): Promise<AnalyzeResult> {
  // Analysis is the most expensive endpoint in the app and it is unauthenticated.
  const limited = await rateLimit("roomAnalysis");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

  const rawPreview = formData.get("preview");
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));

  if (typeof rawPreview !== "string" || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  let preview: z.infer<typeof previewSchema>;
  try {
    preview = previewSchema.parse(JSON.parse(rawPreview));
  } catch {
    return { ok: false, error: "INVALID_INPUT" };
  }
  if (preview.rgba.length !== preview.width * preview.height * 4) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  let bytes: Uint8Array | undefined;
  let contentType: string | undefined;
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    if (image.size > designerConfig.maxUploadBytes) {
      return { ok: false, error: "INVALID_INPUT" };
    }
    const raw = new Uint8Array(await image.arrayBuffer());
    // Even though this image is never stored, it is forwarded to a third-party
    // provider — so it still has to be a real image and not a disguised blob.
    const format = sniffImageFormat(raw);
    if (!format) return { ok: false, error: "INVALID_INPUT" };
    bytes = raw;
    contentType = `image/${format}`;
  }

  try {
    const analysis = await getVisionProvider().analyzeRoom({
      width: Math.round(width),
      height: Math.round(height),
      preview,
      bytes,
      contentType,
    });
    return { ok: true, analysis, needsFullImage: providerNeedsFullImage() };
  } catch (error) {
    log.error("vision.analyze_failed", { error });
    return { ok: false, error: "PROVIDER_FAILED" };
  }
}

/** Exposed so the client knows whether to attach the full image. */
export async function visionProviderInfoAction() {
  const provider = getVisionProvider();
  return {
    id: provider.id,
    label: provider.label,
    needsFullImage: providerNeedsFullImage(),
  };
}
