"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runTick } from "@/lib/agent";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { getConnection, updateSettings } from "@/lib/settings";
import type { ApprovalMode, ImageMode } from "@/lib/types";

function go(path: string, kind: "ok" | "err", msg: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

export async function saveSettings(form: FormData) {
  await requireAdmin();
  const days = form.getAll("publish_days").map(Number).filter((d) => d >= 1 && d <= 7);
  const times = String(form.get("publish_times") ?? "")
    .split(/[\s,]+/)
    .filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t));
  const tags = String(form.get("brand_hashtags") ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
  if (!days.length) go("/settings", "err", "בחרו לפחות יום אחד");
  if (!times.length) go("/settings", "err", "הזינו לפחות שעה אחת בפורמט HH:MM");

  const mode = String(form.get("approval_mode")) as ApprovalMode;
  const imageMode = String(form.get("image_mode")) as ImageMode;
  await updateSettings({
    approval_mode: ["draft", "manual", "auto"].includes(mode) ? mode : "manual",
    posts_per_week: Math.min(21, Math.max(1, Number(form.get("posts_per_week")) || 7)),
    publish_days: days,
    publish_times: times,
    plan_ahead_days: Math.min(14, Math.max(1, Number(form.get("plan_ahead_days")) || 3)),
    image_mode: ["ai", "library", "none"].includes(imageMode) ? imageMode : "ai",
    image_headline: form.get("image_headline") === "on",
    brand_hashtags: tags,
    cta_text: String(form.get("cta_text") ?? "").trim() || "לייעוץ והצעת מחיר – שלחו לנו הודעה",
    phone: String(form.get("phone") ?? "").trim() || null,
    website: String(form.get("website") ?? "").trim() || null,
    service_area: String(form.get("service_area") ?? "").trim() || null,
    extra_instructions: String(form.get("extra_instructions") ?? "").trim() || null,
  });
  await log("info", "settings.save", "ההגדרות עודכנו");
  revalidatePath("/", "layout");
  go("/settings", "ok", "ההגדרות נשמרו");
}

export async function toggleAgent(form: FormData) {
  await requireAdmin();
  const on = form.get("on") === "1";
  await updateSettings({ agent_enabled: on });
  await log("info", "agent.toggle", on ? "הסוכן הופעל" : "הסוכן נעצר");
  revalidatePath("/", "layout");
  go(String(form.get("back") ?? "/"), "ok", on ? "הסוכן פועל" : "הסוכן נעצר");
}

/** The dashboard switch for live publishing. Refuses unless env + verified permissions allow it. */
export async function setLivePublishing(form: FormData) {
  await requireAdmin();
  const on = form.get("on") === "1";
  if (on) {
    if (!env.liveEnabledByEnv()) go("/instagram", "err", "יש להגדיר PUBLISH_LIVE_ENABLED=true ב-Vercel קודם");
    const conn = await getConnection();
    if (!conn.permissions_ok) go("/instagram", "err", "יש לחבר ולאמת הרשאות אינסטגרם קודם");
    if (form.get("confirm") !== "פרסם") go("/instagram", "err", "כדי להפעיל, הקלידו את המילה: פרסם");
  }
  await updateSettings({ live_publishing: on });
  await log("warn", "publish.mode", on ? "פרסום אמיתי הופעל" : "חזרה למצב בדיקות");
  revalidatePath("/", "layout");
  go("/instagram", "ok", on ? "פרסום אמיתי פעיל" : "מצב בדיקות פעיל");
}

export async function runAgentNow() {
  await requireAdmin();
  const s = await runTick("manual");
  revalidatePath("/", "layout");
  const parts = [
    s.skipped ? `דילוג: ${s.skipped}` : null,
    s.generated?.length ? `נוצרו ${s.generated.length}` : null,
    s.published && Object.keys(s.published).length ? `טופלו ${Object.keys(s.published).length} לפרסום` : null,
    s.errors.length ? `שגיאות: ${s.errors.join("; ")}` : null,
  ].filter(Boolean);
  go("/", s.errors.length ? "err" : "ok", parts.join(" · ") || "הריצה הסתיימה – אין משימות כרגע");
}
