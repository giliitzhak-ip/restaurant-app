import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { getFaceSwapProvider } from "@/providers/face-swap";
import { checkLimits } from "@/providers/face-swap/types";
import { budgetStatus, jobBlockers, usd } from "@/server/billing";
import { enqueueAiJob } from "@/server/queue";
import { toAiJobDTO, videoInfoOf, type FaceSwapInput } from "@/server/face-swap";

const schema = z.object({
  // The exact amount the user saw and agreed to. Must match the quote.
  confirmCostCents: z.number().int().min(0),
  acceptCharge: z.literal(true, { errorMap: () => ({ message: "יש לאשר במפורש את העלות" }) }),
});

/** Step 2 of 2: explicit approval of the quoted amount. Only now is the job queued. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "בקשה לא תקינה", 400);

  const job = await db.job.findFirst({ where: { id: (await params).id, userId } });
  if (!job) return jsonError("המשימה לא נמצאה", 404);
  if (job.status !== "PENDING_APPROVAL") return jsonError("המשימה כבר אושרה או בוטלה", 409);
  if (!job.quoteExpiresAt || job.quoteExpiresAt < new Date()) {
    await db.job.update({ where: { id: job.id }, data: { status: "CANCELED", finishedAt: new Date(), errorMessage: "פג תוקף הצעת המחיר" } });
    return jsonError("פג תוקף הצעת המחיר. צרו הצעה חדשה.", 410);
  }
  if (parsed.data.confirmCostCents !== job.estimatedCostCents) {
    return jsonError(`הסכום שאושר אינו תואם להצעת המחיר (${usd(job.estimatedCostCents)}).`, 409);
  }

  const provider = getFaceSwapProvider(job.provider);
  if (!provider) return jsonError("הספק אינו זמין", 503);
  const input = job.input as unknown as FaceSwapInput;
  const target = await db.asset.findFirst({ where: { id: input.targetAssetId, ownerId: userId } });
  const source = await db.asset.findFirst({ where: { id: input.sourceAssetId, ownerId: userId } });
  if (!target || !source) return jsonError("קבצי המקור נמחקו", 409);

  // Re-check everything at approval time: budget, limits and server settings may have changed.
  const blockers = [
    ...checkLimits(provider, videoInfoOf(target), Number(target.sizeBytes)),
    ...jobBlockers({ provider, costCents: job.estimatedCostCents, budget: await budgetStatus(userId) }),
  ];
  if (blockers.length) return jsonError(blockers[0]!, 402, { errors: blockers });

  // Conditional update: two quick taps can't approve (and bill) twice.
  const updated = await db.job.updateMany({
    where: { id: job.id, status: "PENDING_APPROVAL" },
    data: { status: "QUEUED", approvedAt: new Date(), approvedCostCents: job.estimatedCostCents },
  });
  if (updated.count === 0) return jsonError("המשימה כבר אושרה", 409);
  await db.projectEvent.create({
    data: {
      projectId: job.projectId,
      userId,
      type: "faceswap.approved",
      message: `אושרה החלפת פנים: ${provider.displayName}, עלות מאושרת ${usd(job.estimatedCostCents)}`,
      data: { jobId: job.id },
    },
  });
  const queued = await enqueueAiJob(job.id);
  const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  return NextResponse.json({ ok: true, queued, job: toAiJobDTO(fresh) });
}
