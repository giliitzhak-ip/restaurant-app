"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { designerConfig } from "@/config/brand";
import { routes } from "@/config/site";
import { roundTo } from "@/lib/format";
import { ensureGuestToken, getSessionUser } from "@/server/auth/session";
import { addToCart } from "@/server/cart/cart-service";
import { getRepository } from "@/server/repositories";
import { getStorage, readUploadedImage } from "@/server/storage";
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
  | { ok: false; error: "UNSUPPORTED_TYPE" | "FILE_TOO_LARGE" | "UPLOAD_FAILED" };

/**
 * Stores a room photo. Guests get a retention window; signed-in customers keep
 * the photo with their saved design until they delete it (see docs/PRIVACY.md).
 */
export async function uploadRoomImageAction(formData: FormData): Promise<UploadResult> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "UPLOAD_FAILED" };
  }
  try {
    const bytes = await readUploadedImage(file);
    const stored = await getStorage().save({
      data: bytes,
      contentType: file.type,
      keyHint: "room",
    });
    return { ok: true, url: stored.url };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "UPLOAD_FAILED";
    if (reason === "UNSUPPORTED_TYPE" || reason === "FILE_TOO_LARGE") {
      return { ok: false, error: reason };
    }
    return { ok: false, error: "UPLOAD_FAILED" };
  }
}

export type SaveDesignResult =
  | { ok: true; design: RoomDesignRecord }
  | { ok: false; error: string };

export async function saveDesignAction(
  input: SaveDesignInput,
): Promise<SaveDesignResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

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

/** Stores the rendered canvas as an image file and returns its URL. */
export async function saveRenderAction(formData: FormData): Promise<UploadResult> {
  const file = formData.get("render");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "UPLOAD_FAILED" };
  }
  try {
    const stored = await getStorage().save({
      data: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || "image/jpeg",
      keyHint: "render",
    });
    return { ok: true, url: stored.url };
  } catch {
    return { ok: false, error: "UPLOAD_FAILED" };
  }
}

async function assertOwnership(designId: string) {
  const repository = getRepository();
  const design = await repository.getDesign(designId);
  if (!design) return null;
  const user = await getSessionUser();
  if (design.userId && design.userId !== user?.id) return null;
  return design;
}

export async function renameDesignAction(designId: string, name: string) {
  const design = await assertOwnership(designId);
  if (!design) return { ok: false as const };
  await getRepository().renameDesign(designId, name.trim().slice(0, 80));
  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

export async function deleteDesignAction(designId: string) {
  const design = await assertOwnership(designId);
  if (!design) return { ok: false as const };
  await getRepository().deleteDesign(designId);
  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

/** Privacy: removes the stored photo but keeps the product selection. */
export async function deleteDesignImageAction(designId: string) {
  const design = await assertOwnership(designId);
  if (!design) return { ok: false as const };
  await getRepository().deleteDesignImage(designId);
  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

export async function duplicateDesignAction(designId: string) {
  const repository = getRepository();
  const design = await assertOwnership(designId);
  if (!design) return { ok: false as const };
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
    surfaces: design.selections.map((selection) => {
      const mask = design.analysis?.surfaces.find(
        (surface) => surface.id === selection.surfaceId,
      );
      return {
        surfaceId: selection.surfaceId,
        kind: mask?.kind ?? "FLOOR",
        label: mask?.label ?? "משטח",
        productId: selection.productId,
        mask:
          mask ?? {
            id: selection.surfaceId,
            kind: "FLOOR" as const,
            label: "משטח",
            polygon: [],
            holes: [],
            confidence: 1,
            source: "MANUAL" as const,
          },
        settings: selection.settings,
        areaSqm: design.estimatedAreaSqm,
      };
    }),
    expiresAt: null,
  });

  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

/** Adds every product used in a design, sized by the estimated surface area. */
export async function addDesignToCartAction(designId: string) {
  const repository = getRepository();
  const design = await repository.getDesign(designId);
  if (!design) return { ok: false as const, error: "NOT_FOUND" };

  const areaBySurface = new Map<string, number>();
  for (const surface of design.analysis?.surfaces ?? []) {
    areaBySurface.set(surface.id, design.estimatedAreaSqm);
  }

  let added = 0;
  for (const selection of design.selections) {
    const product = await repository.getProductById(selection.productId);
    if (!product) continue;
    await addToCart({
      productId: product.id,
      sqm: areaBySurface.get(selection.surfaceId) ?? design.estimatedAreaSqm,
      designId: design.id,
      designLabel: design.name,
    });
    added += 1;
  }

  revalidatePath(routes.cart);
  return { ok: true as const, added };
}
