"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { designerConfig } from "@/config/brand";
import { routes } from "@/config/site";
import { roundTo } from "@/lib/format";
import { ensureGuestToken, getSessionUser } from "@/server/auth/session";
import { addToCart } from "@/server/cart/cart-service";
import { getRepository } from "@/server/repositories";
import { rateLimit } from "@/server/security/rate-limit";
import { requireDesignOwnership } from "@/server/security/ownership";
import { ImageRejected, sanitiseImageUpload } from "@/server/security/images";
import { getStorage, removeStoredImage } from "@/server/storage";
import { log } from "@/server/observability/logger";
import type { RoomDesignRecord } from "@/types/design";

const pointSchema = z.object({ x: z.number(), y: z.number() });

const maskSchema = z.object({
  id: z.string(),
  kind: z.enum(["FLOOR", "WALL", "CEILING"]),
  label: z.string(),
  polygon: z.array(pointSchema),
  holes: z.array(z.array(pointSchema)),
  confidence: z.number(),
  source: z.enum(["AUTO", "MANUAL"]),
});

const settingsSchema = z.object({
  orientation: z.enum(["HORIZONTAL", "VERTICAL", "DIAGONAL"]),
  scale: z.number(),
  brightness: z.number(),
  offsetX: z.number(),
  offsetY: z.number(),
  stagger: z.number(),
  lightingStrength: z.number(),
  rotation: z.number(),
});

const analysisSchema = z.object({
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  surfaces: z.array(maskSchema),
  objects: z.array(
    z.object({
      kind: z.enum([
        "WINDOW",
        "DOOR",
        "FURNITURE",
        "PERSON",
        "TV",
        "PLANT",
        "RUG",
        "OTHER",
      ]),
      label: z.string(),
      polygon: z.array(pointSchema),
    }),
  ),
  brightness: z.number(),
  sharpness: z.number(),
  warnings: z.array(
    z.enum([
      "NO_FLOOR_DETECTED",
      "NO_WALL_DETECTED",
      "LOW_LIGHT",
      "BLURRY",
      "LOW_RESOLUTION",
    ]),
  ),
  providerId: z.string(),
  analysedAt: z.string(),
});

const saveSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  originalImageUrl: z.string().min(1),
  renderedImageUrl: z.string().nullable().optional(),
  estimatedAreaSqm: z.number().min(0),
  estimatedPrice: z.number().min(0),
  analysis: analysisSchema.nullable().optional(),
  surfaces: z.array(
    z.object({
      surfaceId: z.string(),
      kind: z.enum(["FLOOR", "WALL", "CEILING"]),
      label: z.string(),
      productId: z.string().nullable(),
      mask: maskSchema,
      settings: settingsSchema,
      areaSqm: z.number().min(0),
    }),
  ),
});

export type SaveDesignInput = z.input<typeof saveSchema>;

export type UploadResult =
  | { ok: true; url: string }
  | {
      ok: false;
      error:
        | "UNSUPPORTED_TYPE"
        | "FILE_TOO_LARGE"
        | "CORRUPT_IMAGE"
        | "RATE_LIMITED"
        | "UPLOAD_FAILED";
    };

/**
 * Stores a room photo.
 *
 * The uploaded bytes are never written through: they are identified by magic
 * number, decoded, and re-encoded by us. What lands in storage is our own
 * WebP, which means no polyglot file survives the trip and no EXIF — GPS
 * coordinates of the customer's home very much included — goes with it.
 *
 * Guests get a retention window; signed-in customers keep the photo with their
 * saved design until they delete it (see docs/PRIVACY.md).
 */
export async function uploadRoomImageAction(formData: FormData): Promise<UploadResult> {
  const limited = await rateLimit("upload");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "UPLOAD_FAILED" };
  }
  try {
    const safe = await sanitiseImageUpload(file);
    const stored = await getStorage().save({
      data: safe.data,
      contentType: safe.contentType,
      keyHint: "room",
    });
    return { ok: true, url: stored.url };
  } catch (error) {
    if (error instanceof ImageRejected) return { ok: false, error: error.reason };
    log.error("designs.upload_failed", { error });
    return { ok: false, error: "UPLOAD_FAILED" };
  }
}

export type SaveDesignResult =
  | { ok: true; design: RoomDesignRecord }
  | { ok: false; error: string };

export async function saveDesignAction(
  input: SaveDesignInput,
): Promise<SaveDesignResult> {
  const limited = await rateLimit("designWrite");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  /*
   * An id in the payload means "update". Without this check it means "update
   * anybody's design", because the id is the only thing identifying the row.
   */
  if (parsed.data.id) {
    const owned = await requireDesignOwnership(parsed.data.id);
    if (!owned.ok) return { ok: false, error: owned.error };
  }

  const user = await getSessionUser();
  const guestToken = user ? null : await ensureGuestToken();
  const retentionDays = user
    ? designerConfig.accountImageRetentionDays
    : designerConfig.guestImageRetentionDays;

  const design = await getRepository().saveDesign({
    id: parsed.data.id,
    userId: user?.id ?? null,
    guestToken,
    name: parsed.data.name,
    originalImageUrl: parsed.data.originalImageUrl,
    renderedImageUrl: parsed.data.renderedImageUrl ?? null,
    estimatedAreaSqm: roundTo(parsed.data.estimatedAreaSqm, 2),
    estimatedPrice: roundTo(parsed.data.estimatedPrice, 2),
    analysis: parsed.data.analysis ?? null,
    surfaces: parsed.data.surfaces,
    expiresAt: new Date(Date.now() + retentionDays * 86400000).toISOString(),
  });

  revalidatePath(routes.account.designs);
  return { ok: true, design };
}

/**
 * Stores the rendered canvas.
 *
 * Same treatment as a customer photo: this arrives as a canvas blob from the
 * browser, which is to say from anywhere, so it is size-checked, sniffed and
 * re-encoded rather than written through.
 */
export async function saveRenderAction(formData: FormData): Promise<UploadResult> {
  const limited = await rateLimit("upload");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

  const file = formData.get("render");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "UPLOAD_FAILED" };
  }
  try {
    const safe = await sanitiseImageUpload(file, {
      maxEdge: designerConfig.maxRenderEdge,
      format: "webp",
      quality: 80,
    });
    const stored = await getStorage().save({
      data: safe.data,
      contentType: safe.contentType,
      keyHint: "render",
    });
    return { ok: true, url: stored.url };
  } catch (error) {
    if (error instanceof ImageRejected) return { ok: false, error: error.reason };
    log.error("designs.render_failed", { error });
    return { ok: false, error: "UPLOAD_FAILED" };
  }
}

export async function renameDesignAction(designId: string, name: string) {
  const owned = await requireDesignOwnership(designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };
  await getRepository().renameDesign(designId, name.trim().slice(0, 80));
  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

export async function deleteDesignAction(designId: string) {
  const owned = await requireDesignOwnership(designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };
  await getRepository().deleteDesign(designId);
  // The row and the bytes go together.
  await removeStoredImage(owned.design.originalImageUrl);
  await removeStoredImage(owned.design.renderedImageUrl);
  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

/** Privacy: removes the stored photo but keeps the product selection. */
export async function deleteDesignImageAction(designId: string) {
  const owned = await requireDesignOwnership(designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };
  await getRepository().deleteDesignImage(designId);
  await removeStoredImage(owned.design.originalImageUrl);
  await removeStoredImage(owned.design.renderedImageUrl);
  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

export async function duplicateDesignAction(designId: string) {
  const repository = getRepository();
  const owned = await requireDesignOwnership(designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };
  const design = owned.design;
  const user = await getSessionUser();

  await repository.saveDesign({
    userId: user?.id ?? null,
    guestToken: user ? null : await ensureGuestToken(),
    name: `${design.name} (עותק)`,
    originalImageUrl: design.originalImageUrl,
    renderedImageUrl: design.renderedImageUrl,
    estimatedAreaSqm: design.estimatedAreaSqm,
    estimatedPrice: design.estimatedPrice,
    analysis: design.analysis,
    surfaces: design.surfaces,
    expiresAt: null,
  });

  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

/** Adds every product used in a design, sized by the estimated surface area. */
export async function addDesignToCartAction(designId: string) {
  const repository = getRepository();
  const owned = await requireDesignOwnership(designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };
  const design = owned.design;

  let added = 0;
  for (const surface of design.surfaces) {
    if (!surface.productId) continue;
    const product = await repository.getProductById(surface.productId);
    if (!product) continue;
    await addToCart({
      productId: product.id,
      // Each surface is sized by its own estimated area.
      sqm: Math.max(0.5, surface.areaSqm || design.estimatedAreaSqm),
      designId: design.id,
      designLabel: design.name,
    });
    added += 1;
  }

  revalidatePath(routes.cart);
  return { ok: true as const, added };
}
