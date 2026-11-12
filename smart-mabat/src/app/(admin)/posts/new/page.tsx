import { createManualPost, generateNow } from "@/actions/posts";
import { IconSpark } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { Flash, PageHeader, str, type SP } from "@/components/ui";
import { CATEGORIES } from "@/lib/content/topics";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { upcomingSlots, utcToLocalInput } from "@/lib/scheduler/slots";
import { getSettings } from "@/lib/settings";
import type { MediaAsset } from "@/lib/types";

export default async function NewPostPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const nextSlot = upcomingSlots(settings, 14)[0] ?? null;
  const { data: uploads } = await db().from("media_assets").select("*").eq("kind", "upload").order("created_at", { ascending: false }).limit(30);

  return (
    <div className="space-y-5">
      <Flash ok={str(sp.ok)} err={str(sp.err)} />
      <PageHeader title="פוסט חדש" subtitle="תנו לסוכן לכתוב, או כתבו בעצמכם" />

      <form action={generateNow} className="card space-y-4">
        <div className="flex items-center gap-2">
          <IconSpark className="h-5 w-5 text-tech-glow" />
          <h2 className="h2">יצירה עם הסוכן</h2>
        </div>
        {!env.anthropicKey() && (
          <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200">
            לא הוגדר ANTHROPIC_API_KEY – ייווצר פוסט בדיקה מתבנית קבועה (לא AI).
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">נושא</label>
            <select name="category" className="input">
              <option value="">הסוכן יבחר (לפי ביצועים וגיוון)</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">מועד פרסום (שעון ישראל)</label>
            <input type="datetime-local" name="scheduled_at" defaultValue={utcToLocalInput(nextSlot)} className="input" />
          </div>
        </div>
        <SubmitButton pendingText="הסוכן כותב ויוצר תמונה… (עד דקה)">
          <IconSpark className="h-4 w-4" /> צור פוסט
        </SubmitButton>
      </form>

      <form action={createManualPost} className="card space-y-4">
        <h2 className="h2">כתיבה ידנית</h2>
        <div>
          <label className="label">טקסט הפוסט</label>
          <textarea name="caption" required rows={8} className="input" placeholder="כתבו כאן את הפוסט…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">כותרת על התמונה</label>
            <input name="headline" className="input" placeholder="2–5 מילים" />
          </div>
          <div>
            <label className="label">האשטגים</label>
            <input name="hashtags" className="input" placeholder="#אבטחה #מצלמות" />
          </div>
        </div>
        <div>
          <label className="label">תמונה מהספרייה</label>
          <select name="media_id" className="input">
            <option value="">— ללא —</option>
            {((uploads ?? []) as MediaAsset[]).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title ?? m.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-soft">
          <input type="checkbox" name="ai_image" className="h-5 w-5 accent-tech" /> או: צור תמונת AI לפי התיאור
        </label>
        <input name="image_prompt" className="input" dir="ltr" placeholder="English image description (optional)" />
        <div>
          <label className="label">מועד פרסום (שעון ישראל)</label>
          <input type="datetime-local" name="scheduled_at" defaultValue={utcToLocalInput(nextSlot)} className="input" />
        </div>
        <SubmitButton className="btn-ghost" pendingText="שומר…">
          שמור כטיוטה
        </SubmitButton>
      </form>
    </div>
  );
}
