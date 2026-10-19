import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { clientIp, jsonError } from "@/lib/http";
import { firstError } from "@/lib/validation";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";
import { selectedFaceSwapProvider } from "@/providers/face-swap";
import { buildQuote, QUOTE_TTL_MIN, toAiJobDTO, validateFaceSwapAssets, type FaceSwapInput } from "@/server/face-swap";

const schema = z.object({
  projectId: z.string().min(1),
  sourceAssetId: z.string().min(1, "יש לבחור תמונת פנים"),
  targetAssetId: z.string().min(1, "יש לבחור סרטון"),
  personIndex: z.number().int().min(0).nullable(),
  consent: z.object({
    faceOwner: z.enum(["SELF", "OTHER_WITH_PERMISSION"], { errorMap: () => ({ message: "יש לציין של מי הפנים בתמונה" }) }),
    subjectName: z.string().trim().min(2, "יש לרשום את שם האדם שבתמונה").max(80),
    confirmFace: z.literal(true, { errorMap: () => ({ message: "יש לאשר את זכות השימוש בפנים" }) }),
    confirmVideo: z.literal(true, { errorMap: () => ({ message: "יש לאשר את זכות השימוש בסרטון" }) }),
    confirmLabel: z.literal(true, { errorMap: () => ({ message: "יש לאשר את סימון התוצאה כתוכן AI" }) }),
  }),
});

/**
 * Step 1 of 2: records consent and creates a PENDING_APPROVAL job with a cost
 * quote. Nothing is sent to any provider and nothing is billed here.
 */
export async function POST(req: Request) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { projectId, sourceAssetId, targetAssetId, personIndex, consent } = parsed.data;

  const project = await db.project.findFirst({ where: { id: projectId, ownerId: userId }, select: { id: true } });
  if (!project) return jsonError("הפרויקט לא נמצא", 404);
  const [source, target] = await Promise.all([
    db.asset.findFirst({ where: { id: sourceAssetId, ownerId: userId, projectId } }),
    db.asset.findFirst({ where: { id: targetAssetId, ownerId: userId, projectId } }),
  ]);
  const invalid = validateFaceSwapAssets(source, target, personIndex);
  if (invalid.length) return jsonError(invalid[0]!, 400, { errors: invalid });

  const provider = selectedFaceSwapProvider();
  if (!provider) return jsonError("ספק החלפת הפנים שהוגדר בשרת אינו מוכר", 503);
  const quote = await buildQuote(userId, provider, target!);

  const meta = { ip: clientIp(req), userAgent: req.headers.get("user-agent")?.slice(0, 300) };
  const job = await db.$transaction(async (tx) => {
    // Cancel this user's older unapproved quotes for the same project: one live quote at a time.
    await tx.job.updateMany({
      where: { userId, projectId, type: "FACE_SWAP", status: "PENDING_APPROVAL" },
      data: { status: "CANCELED", finishedAt: new Date(), errorMessage: "הוחלף בהצעת מחיר חדשה" },
    });
    const faceConsent = await tx.consentRecord.create({
      data: {
        userId,
        subject: "FACE",
        relationship: consent.faceOwner,
        subjectName: consent.subjectName,
        statement: [consent.faceOwner === "SELF" ? CONSENT_TEXT.faceSelf : CONSENT_TEXT.faceOther, CONSENT_TEXT.label].join("\n"),
        statementVersion: CONSENT_VERSION,
        ...meta,
      },
    });
    const videoConsent = await tx.consentRecord.create({
      data: {
        userId,
        subject: "VIDEO",
        relationship: "OWNED_CONTENT",
        subjectName: target!.originalName ?? "סרטון",
        statement: CONSENT_TEXT.videoRights,
        statementVersion: CONSENT_VERSION,
        ...meta,
      },
    });
    await tx.asset.update({ where: { id: source!.id }, data: { consentId: faceConsent.id } });
    const input: FaceSwapInput = { sourceAssetId, targetAssetId, personIndex, faceConsentId: faceConsent.id, videoConsentId: videoConsent.id };
    const created = await tx.job.create({
      data: {
        projectId,
        userId,
        type: "FACE_SWAP",
        status: "PENDING_APPROVAL",
        provider: provider.id,
        input: input as unknown as Prisma.InputJsonValue,
        estimatedCostCents: quote.estimate.costCents,
        quote: quote as unknown as Prisma.InputJsonValue,
        quoteExpiresAt: new Date(Date.now() + QUOTE_TTL_MIN * 60_000),
      },
    });
    await tx.projectEvent.create({
      data: {
        projectId,
        userId,
        type: "faceswap.quoted",
        message: `הצעת מחיר להחלפת פנים: ${provider.displayName}, $${(quote.estimate.costCents / 100).toFixed(2)} (ממתין לאישור)`,
        data: { jobId: created.id },
      },
    });
    return created;
  });

  return NextResponse.json({ ok: true, job: toAiJobDTO(job) }, { status: 201 });
}
