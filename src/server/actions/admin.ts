"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/config/site";
import { requireAdmin } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { getStorage, readUploadedImage } from "@/server/storage";
import type { ProductInput } from "@/server/repositories/types";

/**
 * Admin mutations. Every export starts by asserting the session is an admin —
 * server actions are public endpoints, so the check lives here and not only in
 * the layout that renders the screen.
 */

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

export async function setOrderStatusAction(
  id: string,
  status: "PENDING" | "PAID" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED",
): Promise<AdminResult> {
  await requireAdmin();
  await getRepository().setOrderStatus(id, status);
  revalidatePath(routes.admin.orders);
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
    const bytes = await readUploadedImage(file);
    const stored = await getStorage().save({
      data: bytes,
      contentType: file.type,
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
