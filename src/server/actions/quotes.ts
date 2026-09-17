"use server";

import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { getStorage, readUploadedImage } from "@/server/storage";

const quoteSchema = z.object({
  fullName: z.string().trim().min(2, "נדרש שם מלא"),
  phone: z
    .string()
    .trim()
    .regex(/^0\d{1,2}-?\d{7}$|^\+972\d{8,9}$/, "מספר טלפון לא תקין"),
  email: z.string().trim().email("אימייל לא תקין").optional().or(z.literal("")),
  city: z.string().trim().min(2, "נדרשת עיר"),
  areaSqm: z.coerce.number().positive().max(100000).optional(),
  productId: z.string().trim().optional(),
  designId: z.string().trim().optional(),
  wantsInstallation: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
});

export type QuoteResult =
  | { ok: true; number: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function submitQuoteAction(formData: FormData): Promise<QuoteResult> {
  const parsed = quoteSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email") ?? "",
    city: formData.get("city"),
    areaSqm: formData.get("areaSqm") || undefined,
    productId: formData.get("productId") || undefined,
    designId: formData.get("designId") || undefined,
    wantsInstallation: formData.get("wantsInstallation") === "on",
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const repository = getRepository();
  const user = await getSessionUser();
  const data = parsed.data;

  // An attached room design carries its own rendered image; a manual upload is
  // stored through the storage driver.
  let imageUrl: string | null = null;
  const upload = formData.get("image");
  if (upload instanceof File && upload.size > 0) {
    try {
      const bytes = await readUploadedImage(upload);
      const stored = await getStorage().save({
        data: bytes,
        contentType: upload.type,
        keyHint: "quote",
      });
      imageUrl = stored.url;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "UPLOAD_FAILED";
      return { ok: false, error: reason };
    }
  }

  if (!imageUrl && data.designId) {
    const design = await repository.getDesign(data.designId);
    imageUrl = design?.renderedImageUrl ?? design?.originalImageUrl ?? null;
  }

  const quote = await repository.createQuote({
    userId: user?.id ?? null,
    customerName: data.fullName,
    phone: data.phone,
    email: data.email ? data.email : null,
    city: data.city,
    areaSqm: data.areaSqm ?? null,
    productId: data.productId ?? null,
    designId: data.designId ?? null,
    imageUrl,
    wantsInstallation: data.wantsInstallation,
    notes: data.notes ?? null,
  });

  return { ok: true, number: quote.number };
}
