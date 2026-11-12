"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db, MEDIA_BUCKET } from "@/lib/db";
import { storeMedia } from "@/lib/images/media";
import { errMsg, log } from "@/lib/logger";
import { updateSettings } from "@/lib/settings";

const MAX_BYTES = 6 * 1024 * 1024;

/** Photos are resized in the browser first (handles iPhone HEIC → JPEG), then sent here. */
export async function uploadMedia(_prev: { error?: string; ok?: string } | undefined, form: FormData) {
  await requireAdmin();
  const file = form.get("file");
  const asLogo = form.get("as_logo") === "1";
  if (!(file instanceof File) || file.size === 0) return { error: "לא נבחר קובץ" };
  if (file.size > MAX_BYTES) return { error: "הקובץ גדול מדי (מקסימום 6MB)" };
  try {
    const asset = await storeMedia(Buffer.from(await file.arrayBuffer()), asLogo ? "logo" : "upload", {
      title: String(form.get("title") ?? "").trim() || file.name,
      tags: String(form.get("tags") ?? "")
        .split(/[\s,]+/)
        .filter(Boolean),
    });
    if (asLogo) await updateSettings({ logo_media_id: asset.id });
    await log("info", "media.upload", asLogo ? "לוגו הועלה" : "תמונה הועלתה לספרייה");
    revalidatePath("/media");
    revalidatePath("/settings");
    return { ok: asLogo ? "הלוגו נשמר" : "התמונה נוספה לספרייה" };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function deleteMedia(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const { data: used } = await db().from("posts").select("id").eq("media_id", id).limit(1);
  if (used?.length) redirect("/media?err=" + encodeURIComponent("התמונה בשימוש בפוסט ולא ניתן למחוק"));
  const { data: asset } = await db().from("media_assets").select("storage_path").eq("id", id).single();
  if (asset) await db().storage.from(MEDIA_BUCKET).remove([asset.storage_path]);
  await db().from("media_assets").delete().eq("id", id);
  revalidatePath("/media");
  redirect("/media?ok=" + encodeURIComponent("נמחק"));
}
