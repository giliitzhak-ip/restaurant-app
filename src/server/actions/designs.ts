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
import { normaliseScene, sceneSchema } from "@/server/design/scene";
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
  /*
   * Optional, and omitting it means "leave the stored scene alone" rather
   * than "there is no scene". The surfaces and the scene are edited by
   * different parts of the designer, and a save from one must not be able to
   * delete the other's work.
   */
  scene: sceneSchema.optional().nullable(),
});

/**
 * Which product ids the catalogue will actually vouch for.
 *
 * Objects arrive from the browser carrying whatever `productId` the client
 * put on them. That claim decides whether an item can be put in a basket with
 * a price, so it is checked here against live, active products — the one
 * place the decision is made, and the reason an illustration cannot be sold
 * as a product by editing a request.
 */
async function sellableProductIds(scene: unknown): Promise<Set<string>> {
  const claimed = new Set<string>();
  const objects =
    scene && typeof scene === "object" && "objects" in scene
      ? (scene as { objects?: unknown }).objects
      : null;
  if (Array.isArray(objects)) {
    for (const object of objects) {
      const id = (object as { productId?: unknown })?.productId;
      if (typeof id === "string" && id) claimed.add(id);
    }
  }
  if (!claimed.size) return claimed;

  const products = await getRepository().getProductsByIds([...claimed]);
  return new Set(products.filter((product) => product.active).map((p) => p.id));
}

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

/**
 * Stores a product photo a customer cut out themselves.
 *
 * The brief asks for automatic background removal "if a suitable provider
 * exists". None is configured here, and inventing one would mean shipping a
 * feature that silently does nothing — so the editor offers a manual cutout
 * instead and says which it is doing. When a provider is added, it belongs
 * behind the same adapter pattern the vision provider already uses; this
 * action does not change.
 *
 * What arrives is a PNG the browser produced by clipping the customer's photo
 * to a shape they drew. It gets exactly the treatment a room photo gets:
 * size-checked, identified by magic bytes, fully decoded and re-encoded by
 * us, so no polyglot survives and the EXIF — including where the photo was
 * taken — does not. Alpha quality is held at 100, because a lossy alpha
 * channel puts a grey halo around a cutout on dark cladding.
 *
 * It is stored against this customer's design and nowhere else. Nothing here
 * writes to the shared object library: one customer's sofa is not a catalogue
 * entry, and publishing it would be publishing their photograph.
 */
export async function uploadDesignObjectAction(
  formData: FormData,
): Promise<UploadResult> {
  const limited = await rateLimit("upload");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "UPLOAD_FAILED" };
  }

  try {
    const safe = await sanitiseImageUpload(file, {
      // A cut-out object never needs to be as large as a room photo.
      maxEdge: 1200,
      alphaQuality: 100,
    });
    const stored = await getStorage().save({
      data: safe.data,
      contentType: safe.contentType,
      keyHint: "object",
    });
    return { ok: true, url: stored.url };
  } catch (error) {
    if (error instanceof ImageRejected) return { ok: false, error: error.reason };
    log.error("designs.object_upload_failed", { error });
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
    scene: parsed.data.scene
      ? normaliseScene(parsed.data.scene, await sellableProductIds(parsed.data.scene))
      : null,
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

/* ------------------------------------------------------------------ *
 * Versions
 * ------------------------------------------------------------------ */

/**
 * Keeps a snapshot the customer can come back to.
 *
 * Undo is for the last few minutes; this is for "I liked it better before I
 * moved everything an hour ago". It stores the surfaces and the scene as they
 * are, and the preview that was already uploaded — a version is a bookmark,
 * not a second copy of the photograph.
 */
export async function saveDesignVersionAction(designId: string, label?: string) {
  const limited = await rateLimit("designWrite");
  if (!limited.ok) return { ok: false as const, error: "RATE_LIMITED" };

  const owned = await requireDesignOwnership(designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };

  const design = owned.design;
  const version = await getRepository().saveDesignVersion({
    designId,
    label: label?.trim().slice(0, 60) || null,
    previewUrl: design.renderedImageUrl,
    snapshot: {
      surfaces: design.surfaces,
      scene: design.scene,
      estimatedAreaSqm: design.estimatedAreaSqm,
      estimatedPrice: design.estimatedPrice,
    },
  });

  revalidatePath(routes.account.designs);
  return { ok: true as const, version };
}

export async function listDesignVersionsAction(designId: string) {
  const owned = await requireDesignOwnership(designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };
  return { ok: true as const, versions: await getRepository().listDesignVersions(designId) };
}

/**
 * Puts a kept version back.
 *
 * Ownership is checked on the *design*, resolved from the version — a version
 * id on its own is a claim, and checking the version's own row would let
 * anyone who guessed an id restore into someone else's design.
 */
export async function restoreDesignVersionAction(versionId: string) {
  const limited = await rateLimit("designWrite");
  if (!limited.ok) return { ok: false as const, error: "RATE_LIMITED" };

  const repository = getRepository();
  const version = await repository.getDesignVersion(versionId);
  if (!version) return { ok: false as const, error: "NOT_FOUND" };

  const owned = await requireDesignOwnership(version.designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };

  const snapshot = version.snapshot as {
    surfaces?: unknown;
    scene?: unknown;
    estimatedAreaSqm?: number;
    estimatedPrice?: number;
  } | null;
  const parsed = saveSchema
    .pick({ surfaces: true })
    .safeParse({ surfaces: snapshot?.surfaces ?? [] });
  if (!parsed.success) return { ok: false as const, error: "INVALID_SNAPSHOT" };

  const design = owned.design;
  await repository.saveDesign({
    id: design.id,
    userId: design.userId,
    guestToken: null,
    name: design.name,
    originalImageUrl: design.originalImageUrl,
    renderedImageUrl: version.previewUrl,
    estimatedAreaSqm: snapshot?.estimatedAreaSqm ?? design.estimatedAreaSqm,
    estimatedPrice: snapshot?.estimatedPrice ?? design.estimatedPrice,
    analysis: design.analysis,
    surfaces: parsed.data.surfaces,
    // Re-validated on the way back in, exactly as a fresh save would be: a
    // row written by an older build must not reintroduce a claim that is no
    // longer true.
    scene: normaliseScene(snapshot?.scene, await sellableProductIds(snapshot?.scene)),
    expiresAt: design.expiresAt,
  });

  revalidatePath(routes.account.designs);
  return { ok: true as const };
}

export async function deleteDesignVersionAction(versionId: string) {
  const repository = getRepository();
  const version = await repository.getDesignVersion(versionId);
  if (!version) return { ok: false as const, error: "NOT_FOUND" };
  const owned = await requireDesignOwnership(version.designId);
  if (!owned.ok) return { ok: false as const, error: owned.error };
  await repository.deleteDesignVersion(versionId);
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
    // A copy is a copy: the furniture and the lighting come with it.
    scene: design.scene,
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
