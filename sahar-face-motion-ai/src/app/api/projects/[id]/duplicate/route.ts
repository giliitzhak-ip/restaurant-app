import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { duplicateProject } from "@/server/projects";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  try {
    const id = await duplicateProject(auth.user.id, (await params).id);
    if (!id) return jsonError("הפרויקט לא נמצא", 404);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    console.error("duplicate failed", e);
    return jsonError("שכפול הפרויקט נכשל. נסו שוב.", 500);
  }
}
