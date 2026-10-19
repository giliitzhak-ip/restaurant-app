import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { firstError, projectCreateSchema } from "@/lib/validation";
import { listProjectsForUser } from "@/server/projects";

const MAX_PROJECTS = 200;

export async function GET(req: Request) {
  const auth = await apiUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ ok: true, projects: await listProjectsForUser(auth.user.id) });
}

export async function POST(req: Request) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  const parsed = projectCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);

  if ((await db.project.count({ where: { ownerId: auth.user.id } })) >= MAX_PROJECTS) {
    return jsonError(`הגעתם למספר הפרויקטים המרבי (${MAX_PROJECTS}). מחקו פרויקטים ישנים כדי ליצור חדשים.`, 409);
  }
  const project = await db.project.create({
    data: {
      ownerId: auth.user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      aspectRatio: parsed.data.aspectRatio,
      events: { create: { userId: auth.user.id, type: "project.created", message: "הפרויקט נוצר" } },
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: project.id }, { status: 201 });
}
