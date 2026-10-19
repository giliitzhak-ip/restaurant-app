import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { budgetStatus, maxUserBudgetCents, usd } from "@/server/billing";

export async function GET(req: Request) {
  const auth = await apiUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ ok: true, budget: await budgetStatus(auth.user.id), maxCents: maxUserBudgetCents() });
}

/** The user's own monthly cap for paid AI usage. 0 disables paid providers for them. */
export async function PUT(req: Request) {
  const auth = await apiUser(req, { mutating: true });
  if ("response" in auth) return auth.response;
  const max = maxUserBudgetCents();
  const parsed = z
    .object({ monthlyBudgetCents: z.number().int().min(0).max(max, `התקציב המרבי המותר הוא ${usd(max)} לחודש`) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "סכום לא תקין", 400);
  await db.user.update({ where: { id: auth.user.id }, data: { monthlyBudgetCents: parsed.data.monthlyBudgetCents } });
  return NextResponse.json({ ok: true, budget: await budgetStatus(auth.user.id) });
}
