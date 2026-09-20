"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/config/site";
import { requireAdmin } from "@/server/auth/session";
import { ADMIN_SETTABLE } from "@/server/commerce/order-flow";
import { getRepository } from "@/server/repositories";
import { clientKey } from "@/server/security/rate-limit";
import { sanitiseImageUpload } from "@/server/security/images";
import { getStorage } from "@/server/storage";
import type { ProductInput } from "@/server/repositories/types";
import type { OrderStatus, SessionUser } from "@/types/commerce";
import type { LightingPreset } from "@/types/scene";

/**
 * Admin mutations. Every export starts by asserting the session is an admin —
 * server actions are public endpoints, so the check lives here and not only in
 * the layout that renders the screen.
 *
 * Mutations that change money, stock or a customer's order also write to the
 * audit log, so "who changed this price" has an answer.
 */

async function recordAdminAction(
  admin: SessionUser,
  input: {
    action: string;
    entity: string;
    entityId: string | null;
    detail?: Record<string, unknown>;
  },
) {
  try {
    await getRepository().recordAuditEvent({
      actorId: admin.id,
      actorEmail: admin.email,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      detail: input.detail ?? null,
      ip: await clientKey(),
    });
  } catch {
    // An audit write must never block the operation it describes.
  }
}

const specsSchema = z.object({
  material: z.enum([
    "WOOD",
    "SPC",
    "LAMINATE",
    "MDF",
    "STONE",
    "CONCRETE",
    "PVC",
    "METAL",
  ]),
  materialLabel: z.string().trim().min(1),
  widthMm: z.coerce.number().int().positive(),
  lengthMm: z.coerce.number().int().positive(),
  thicknessMm: z.coerce.number().positive(),
  wearLayerMm: z.coerce.number().positive().optional(),
  colorName: z.string().trim().min(1),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "צבע לא תקין"),
  tone: z.enum(["LIGHT", "NATURAL", "WARM", "COLD", "DARK"]),
  style: z.array(
    z.enum([
      "MODERN",
      "MINIMAL",
      "LUXURY",
      "WARM",
      "SCANDINAVIAN",
      "INDUSTRIAL",
      "CLASSIC",
    ]),
  ),
  textureLabel: z.string().trim().min(1),
  durability: z.string().trim().min(1),
  warrantyYears: z.coerce.number().int().min(0),
  installationType: z.string().trim().min(1),
  waterResistance: z.enum(["WATERPROOF", "SPLASH_PROOF", "NOT_RESISTANT"]),
  usage: z.enum(["INDOOR", "OUTDOOR", "BOTH"]),
  surface: z.enum(["FLOOR", "WALL", "BOTH"]),
  underfloorHeating: z.boolean().optional(),
  acousticRating: z.string().trim().optional(),
});

const productSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "slug באנגלית ובמקפים בלבד"),
  sku: z.string().trim().min(1),
  name: z.string().trim().min(2),
  subtitle: z.string().trim().min(2),
  brand: z.string().trim().min(1),
  categorySlug: z.string().trim().min(1),
  collectionSlug: z.string().trim().nullable(),
  description: z.string().trim().min(10),
  installationNotes: z.string().trim(),
  maintenanceNotes: z.string().trim(),
  pricePerUnit: z.coerce.number().positive(),
  compareAtPrice: z.coerce.number().positive().nullable(),
  pricingUnit: z.enum(["PACKAGE", "ITEM"]),
  packageCoverageSqm: z.coerce.number().positive().nullable(),
  stockUnits: z.coerce.number().int().min(0),
  leadTimeDays: z.coerce.number().int().min(0),
  sampleAvailable: z.boolean(),
  quoteOnly: z.boolean(),
  featured: z.boolean(),
  isNew: z.boolean(),
  bestSeller: z.boolean(),
  active: z.boolean(),
  specs: specsSchema,
  images: z.array(
    z.object({
      url: z.string().min(1),
      alt: z.string().trim(),
      kind: z.enum(["STUDIO", "ROOM", "DETAIL"]),
    }),
  ),
  texture: z
    .object({
      imageUrl: z.string().min(1),
      thumbnailUrl: z.string().min(1),
      widthCm: z.coerce.number().positive(),
      heightCm: z.coerce.number().positive(),
      patternType: z.enum(["PLANK", "TILE", "PANEL", "STONE", "CUSTOM"]),
      repeatX: z.coerce.number().int().positive(),
      repeatY: z.coerce.number().int().positive(),
      orientation: z.enum(["HORIZONTAL", "VERTICAL", "DIAGONAL"]),
      scaleFactor: z.coerce.number().positive(),
    })
    .nullable(),
});

export type AdminProductInput = z.input<typeof productSchema>;

export type AdminResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function saveProductAction(
  id: string | null,
  input: AdminProductInput,
): Promise<AdminResult<{ id: string; slug: string }>> {
  await requireAdmin();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const repository = getRepository();
  const payload = parsed.data as ProductInput;
  const product = id
    ? await repository.updateProduct(id, payload)
    : await repository.createProduct(payload);

  revalidatePath(routes.admin.products);
  revalidatePath(routes.product(product.slug));
  revalidatePath(routes.category(product.categorySlug));
  revalidatePath(routes.catalog);
  return { ok: true, data: { id: product.id, slug: product.slug } };
}

export async function deleteProductAction(id: string): Promise<AdminResult> {
  await requireAdmin();
  await getRepository().deleteProduct(id);
  revalidatePath(routes.admin.products);
  revalidatePath(routes.catalog);
  return { ok: true };
}

export async function duplicateProductAction(
  id: string,
): Promise<AdminResult<{ id: string }>> {
  await requireAdmin();
  const product = await getRepository().duplicateProduct(id);
  revalidatePath(routes.admin.products);
  return { ok: true, data: { id: product.id } };
}

export async function setStockAction(
  id: string,
  stockUnits: number,
): Promise<AdminResult> {
  await requireAdmin();
  await getRepository().setProductStock(id, Math.max(0, Math.round(stockUnits)));
  revalidatePath(routes.admin.inventory);
  revalidatePath(routes.catalog);
  return { ok: true };
}

/**
 * Manual status change from the admin panel.
 *
 * Goes through the same state machine as the payment webhook, so a
 * salesperson cannot move an order somewhere the machine forbids, and a
 * cancellation hands the reserved stock back.
 */
export async function setOrderStatusAction(
  id: string,
  status: OrderStatus,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!ADMIN_SETTABLE.includes(status)) return { ok: false, error: "INVALID_STATUS" };

  const repository = getRepository();
  const moved = await repository.transitionOrder({
    id,
    to: status,
    releaseStock: status === "CANCELLED",
  });
  if (!moved) return { ok: false, error: "INVALID_TRANSITION" };

  await recordAdminAction(admin, {
    action: "order.status",
    entity: "Order",
    entityId: id,
    detail: { to: status },
  });
  revalidatePath(routes.admin.orders);
  revalidatePath(routes.account.orders);
  return { ok: true };
}

export async function setQuoteStatusAction(
  id: string,
  status: "NEW" | "IN_PROGRESS" | "SENT" | "WON" | "LOST",
): Promise<AdminResult> {
  await requireAdmin();
  await getRepository().setQuoteStatus(id, status);
  revalidatePath(routes.admin.quotes);
  return { ok: true };
}

export async function setReviewApprovalAction(
  id: string,
  approved: boolean,
): Promise<AdminResult> {
  await requireAdmin();
  await getRepository().setReviewApproval(id, approved);
  revalidatePath(routes.admin.reviews);
  return { ok: true };
}

const couponSchema = z.object({
  code: z.string().trim().min(3).max(24),
  kind: z.enum(["PERCENT", "FIXED"]),
  value: z.coerce.number().positive(),
  minSubtotal: z.coerce.number().positive().nullable(),
  active: z.boolean(),
  expiresAt: z.string().nullable(),
});

export async function saveCouponAction(
  input: z.input<typeof couponSchema> & { id?: string },
): Promise<AdminResult> {
  await requireAdmin();
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  await getRepository().upsertCoupon({ id: input.id, ...parsed.data });
  revalidatePath(routes.admin.coupons);
  return { ok: true };
}

const categorySchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2),
  shortDescription: z.string().trim().min(2),
  longDescription: z.string().trim().min(2),
  heroImage: z.string().min(1),
  tileImage: z.string().min(1),
  surface: z.enum(["FLOOR", "WALL", "BOTH"]),
  position: z.coerce.number().int().min(0),
  seoTitle: z.string().trim().min(2),
  seoDescription: z.string().trim().min(2),
});

export async function saveCategoryAction(
  input: z.input<typeof categorySchema> & { id?: string },
): Promise<AdminResult> {
  await requireAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  await getRepository().upsertCategory({ id: input.id, ...parsed.data });
  revalidatePath(routes.admin.categories);
  revalidatePath(routes.home);
  return { ok: true };
}

const collectionSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2),
  description: z.string().trim().min(2),
  story: z.string().trim().min(2),
  heroImage: z.string().min(1),
  featured: z.boolean(),
  position: z.coerce.number().int().min(0),
});

export async function saveCollectionAction(
  input: z.input<typeof collectionSchema> & { id?: string },
): Promise<AdminResult> {
  await requireAdmin();
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  await getRepository().upsertCollection({ id: input.id, ...parsed.data });
  revalidatePath(routes.admin.collections);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * The room designer's object library
 * ------------------------------------------------------------------ */

const objectCategorySchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(48)
    // Uppercase with underscores, because the key is what a scene object
    // stores and what behaviour keys off — a category renamed in Hebrew must
    // not orphan every design that used it.
    .regex(/^[A-Z][A-Z0-9_]*$/, "KEY_FORMAT"),
  name: z.string().trim().min(1).max(60),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  enabled: z.boolean(),
});

const objectAssetSchema = z.object({
  categoryId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  /*
   * A site-relative path only — the same rule the scene validator enforces,
   * for the same reason: this url is rendered into an <img> in every
   * customer's designer, so an external one would make the library a
   * tracking vector and a data: one worse than that.
   */
  assetUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine((value) => value.startsWith("/") && !value.startsWith("//"), "ASSET_PATH"),
  realWidthCm: z.coerce.number().min(1).max(2000),
  realHeightCm: z.coerce.number().min(1).max(2000),
  snap: z.enum(["WALL", "FLOOR", "NICHE", "FREE"]),
  soldOnSite: z.boolean(),
  productId: z.string().trim().min(1).nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  enabled: z.boolean(),
});

export async function saveDesignObjectCategoryAction(
  input: z.input<typeof objectCategorySchema> & { id?: string },
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const parsed = objectCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  const saved = await getRepository().saveDesignObjectCategory({
    id: input.id,
    ...parsed.data,
  });
  await recordAdminAction(admin, {
    action: input.id ? "design_object_category.update" : "design_object_category.create",
    entity: "DesignObjectCategory",
    entityId: saved.id,
    detail: { key: saved.key },
  });
  revalidatePath(routes.admin.objects);
  revalidatePath(routes.designer);
  return { ok: true };
}

export async function deleteDesignObjectCategoryAction(
  id: string,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  await getRepository().deleteDesignObjectCategory(id);
  await recordAdminAction(admin, {
    action: "design_object_category.delete",
    entity: "DesignObjectCategory",
    entityId: id,
  });
  revalidatePath(routes.admin.objects);
  revalidatePath(routes.designer);
  return { ok: true };
}

/**
 * Saves a library item.
 *
 * `soldOnSite` is only honoured with a product id that resolves to a live
 * catalogue row. An asset marked for sale with nothing behind it would put a
 * basket button on an illustration, and the price would come from nowhere —
 * so the claim is dropped here rather than being trusted, and the form is
 * told why.
 */
export async function saveDesignObjectAssetAction(
  input: z.input<typeof objectAssetSchema> & { id?: string },
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const parsed = objectAssetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  let { productId, soldOnSite } = parsed.data;
  if (productId) {
    const [product] = await getRepository().getProductsByIds([productId]);
    if (!product || !product.active) {
      productId = null;
      soldOnSite = false;
    }
  }
  if (!productId) soldOnSite = false;

  const saved = await getRepository().saveDesignObjectAsset({
    id: input.id,
    ...parsed.data,
    productId,
    soldOnSite,
  });
  await recordAdminAction(admin, {
    action: input.id ? "design_object_asset.update" : "design_object_asset.create",
    entity: "DesignObjectAsset",
    entityId: saved.id,
    detail: { name: saved.name, soldOnSite, productId },
  });
  revalidatePath(routes.admin.objects);
  revalidatePath(routes.designer);
  return soldOnSite === parsed.data.soldOnSite
    ? { ok: true }
    : { ok: false, error: "PRODUCT_NOT_SELLABLE" };
}

export async function deleteDesignObjectAssetAction(id: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  await getRepository().deleteDesignObjectAsset(id);
  await recordAdminAction(admin, {
    action: "design_object_asset.delete",
    entity: "DesignObjectAsset",
    entityId: id,
  });
  revalidatePath(routes.admin.objects);
  revalidatePath(routes.designer);
  return { ok: true };
}

/**
 * Uploads library artwork.
 *
 * PNG and SVG both arrive here, and they need different handling. A PNG goes
 * through the same decode-and-re-encode every upload gets, with alpha quality
 * held at 100 so a cut-out edge does not halo. An SVG is a document, not a
 * bitmap: sharp would rasterise it and throw away the reason to use one, and
 * passing it through untouched would let a `<script>` inside it run on every
 * customer's designer. So SVG is refused here, and the honest way to add
 * vector artwork is the generator in `scripts/generate-objects.ts`, which is
 * code and gets reviewed.
 */
export async function uploadDesignObjectAssetAction(
  formData: FormData,
): Promise<AdminUploadResult> {
  await requireAdmin();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "UPLOAD_FAILED" };
  }
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    return { ok: false, error: "SVG_NOT_ACCEPTED" };
  }
  try {
    const safe = await sanitiseImageUpload(file, { maxEdge: 1200, alphaQuality: 100 });
    const stored = await getStorage().save({
      data: safe.data,
      contentType: safe.contentType,
      keyHint: "library",
    });
    return { ok: true, url: stored.url };
  } catch {
    return { ok: false, error: "UPLOAD_FAILED" };
  }
}

/* ------------------------------------------------------------------ *
 * Lighting presets
 * ------------------------------------------------------------------ */

export async function saveLightingPresetAction(
  input: LightingPreset,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!input.name?.trim()) return { ok: false, error: "INVALID_INPUT" };
  const saved = await getRepository().saveLightingPreset({
    ...input,
    name: input.name.trim().slice(0, 60),
  });
  await recordAdminAction(admin, {
    action: "lighting_preset.save",
    entity: "LightingPreset",
    entityId: saved.id,
    detail: { name: saved.name },
  });
  revalidatePath(routes.admin.objects);
  revalidatePath(routes.designer);
  return { ok: true };
}

export async function deleteLightingPresetAction(id: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  await getRepository().deleteLightingPreset(id);
  await recordAdminAction(admin, {
    action: "lighting_preset.delete",
    entity: "LightingPreset",
    entityId: id,
  });
  revalidatePath(routes.admin.objects);
  revalidatePath(routes.designer);
  return { ok: true };
}

export type AdminUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Product photography and — importantly — the texture used by the designer. */
export async function uploadAdminImageAction(
  formData: FormData,
): Promise<AdminUploadResult> {
  await requireAdmin();
  const file = formData.get("file");
  const hint = String(formData.get("hint") ?? "product");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "NO_FILE" };
  }
  try {
    // Admin uploads get the same treatment as customer ones: an authenticated
    // account is not a reason to write unvalidated bytes into public storage.
    const safe = await sanitiseImageUpload(file, { maxEdge: 2400, format: "webp", quality: 86 });
    const stored = await getStorage().save({
      data: safe.data,
      contentType: safe.contentType,
      keyHint: hint.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "product",
    });
    return { ok: true, url: stored.url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "UPLOAD_FAILED",
    };
  }
}
