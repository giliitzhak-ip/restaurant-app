"use server";

import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { ImageRejected, sanitiseImageUpload } from "@/server/security/images";
import { requireDesignOwnership } from "@/server/security/ownership";
import { rateLimit } from "@/server/security/rate-limit";
import { log } from "@/server/observability/logger";

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
  const limited = await rateLimit("quote");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

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
      const safe = await sanitiseImageUpload(upload);
      const { getStorage } = await import("@/server/storage");
      const stored = await getStorage().save({
        data: safe.data,
        contentType: safe.contentType,
        keyHint: "quote",
      });
      imageUrl = stored.url;
    } catch (error) {
      if (error instanceof ImageRejected) return { ok: false, error: error.reason };
      log.error("quotes.upload_failed", { error });
      return { ok: false, error: "UPLOAD_FAILED" };
    }
  }

  /*
   * A design id in the form is a claim about someone else's row until it is
   * checked. Attaching an unowned design would leak its rendered photo into a
   * quote the attacker can then read.
   */
  let designId: string | null = null;
  if (data.designId) {
    const owned = await requireDesignOwnership(data.designId);
    if (!owned.ok) return { ok: false, error: "DESIGN_NOT_FOUND" };
    designId = owned.design.id;
    if (!imageUrl) {
      imageUrl = owned.design.renderedImageUrl ?? owned.design.originalImageUrl ?? null;
    }
  }

  const quote = await repository.createQuote({
    userId: user?.id ?? null,
    customerName: data.fullName,
    phone: data.phone,
    email: data.email ? data.email : null,
    city: data.city,
    areaSqm: data.areaSqm ?? null,
    productId: data.productId ?? null,
    designId,
    imageUrl,
    wantsInstallation: data.wantsInstallation,
    notes: data.notes ?? null,
  });

  return { ok: true, number: quote.number };
}
