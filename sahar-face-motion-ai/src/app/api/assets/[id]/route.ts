import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { deleteAsset } from "@/server/projects";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  if (!(await deleteAsset(auth.user.id, (await params).id))) return jsonError("הקובץ לא נמצא", 404);
  return NextResponse.json({ ok: true });
}
