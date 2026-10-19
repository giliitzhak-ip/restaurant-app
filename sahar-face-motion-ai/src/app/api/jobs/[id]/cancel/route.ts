import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";

/** Cancels a job that has not been sent to a provider yet (quote or queued). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  const job = await db.job.findFirst({ where: { id: (await params).id, userId: auth.user.id } });
  if (!job) return jsonError("המשימה לא נמצאה", 404);
  const res = await db.job.updateMany({
    where: { id: job.id, status: { in: ["PENDING_APPROVAL", "QUEUED"] }, providerJobId: null },
    data: { status: "CANCELED", finishedAt: new Date(), errorMessage: "בוטל על ידי המשתמש" },
  });
  if (res.count === 0) return jsonError("לא ניתן לבטל משימה שכבר נשלחה לעיבוד אצל הספק", 409);
  await db.projectEvent.create({
    data: { projectId: job.projectId, userId: auth.user.id, type: "job.canceled", message: "משימת החלפת פנים בוטלה", data: { jobId: job.id } },
  });
  return NextResponse.json({ ok: true });
}
