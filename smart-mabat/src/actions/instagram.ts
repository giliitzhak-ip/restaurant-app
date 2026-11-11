"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { disconnect, reverifyConnection, saveConnection } from "@/lib/instagram/connection";
import { updateSettings } from "@/lib/settings";

function go(kind: "ok" | "err", msg: string): never {
  redirect(`/instagram?${kind}=${encodeURIComponent(msg)}`);
}

export async function connectInstagram(form: FormData) {
  await requireAdmin();
  const host = form.get("api_host") === "facebook" ? "facebook" : "instagram";
  const token = String(form.get("token") ?? "").trim();
  const igId = String(form.get("ig_user_id") ?? "").trim() || null;
  if (token.length < 20) go("err", "הטוקן קצר מדי");
  const v = await saveConnection(host, token, igId);
  revalidatePath("/", "layout");
  if (v.ok) go("ok", `חובר בהצלחה ל-@${v.username ?? v.igUserId}. ההרשאות אומתו (קריאה בלבד – לא פורסם דבר).`);
  go("err", v.error ?? `חסרות הרשאות: ${v.missing.join(", ")}`);
}

export async function verifyInstagram() {
  await requireAdmin();
  const v = await reverifyConnection();
  revalidatePath("/", "layout");
  if (!v) go("err", "אין חיבור");
  if (v.ok) go("ok", "ההרשאות תקינות");
  go("err", v.error ?? `חסרות הרשאות: ${v.missing.join(", ")}`);
}

export async function disconnectInstagram() {
  await requireAdmin();
  await disconnect();
  await updateSettings({ live_publishing: false });
  revalidatePath("/", "layout");
  go("ok", "החיבור נותק ופרסום אמיתי כובה");
}
