import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { firstError, projectUpdateSchema } from "@/lib/validation";
import { deleteProject, getProjectForUser } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const auth = await apiUser(req);
  if ("response" in auth) return auth.response;
  const project = await getProjectForUser(auth.user.id, (await params).id);
  if (!project) return jsonError("הפרויקט לא נמצא", 404);
  return NextResponse.json({ ok: true, project });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = projectUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);

  const existing = await db.project.findFirst({ where: { id, ownerId: auth.user.id }, select: { id: true } });
  if (!existing) return jsonError("הפרויקט לא נמצא", 404);
  const { name, description, aspectRatio } = parsed.data;
  await db.project.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(aspectRatio !== undefined && { aspectRatio }),
      events: { create: { userId: auth.user.id, type: "project.updated", message: "פרטי הפרויקט עודכנו" } },
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  if (!(await deleteProject(auth.user.id, (await params).id))) return jsonError("הפרויקט לא נמצא", 404);
  return NextResponse.json({ ok: true });
}
