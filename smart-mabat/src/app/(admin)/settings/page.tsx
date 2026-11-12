import { saveSettings, toggleAgent } from "@/actions/settings";
import { SubmitButton } from "@/components/submit-button";
import { UploadForm } from "@/components/upload-form";
import { Flash, PageHeader, str, type SP } from "@/components/ui";
import { getMedia } from "@/lib/images/media";
import { formatIL, upcomingSlots } from "@/lib/scheduler/slots";
import { getSettings } from "@/lib/settings";

const DAYS = [
  { v: 7, l: "א׳" },
  { v: 1, l: "ב׳" },
  { v: 2, l: "ג׳" },
  { v: 3, l: "ד׳" },
  { v: 4, l: "ה׳" },
  { v: 5, l: "ו׳" },
  { v: 6, l: "ש׳" },
];

const MODES = [
  { v: "draft", t: "טיוטה בלבד", d: "הסוכן כותב טיוטות. שום דבר לא נכנס לתור בלי שתאשרו." },
  { v: "manual", t: "אישור ידני", d: "הסוכן מכין פוסט לכל משבצת וממתין לאישור שלכם." },
  { v: "auto", t: "פרסום אוטומטי", d: "פוסט שעבר את כל הבדיקות נכנס לתור לבד. פוסט שנכשל – ממתין לכם." },
];

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const s = await getSettings();
  const logo = s.logo_media_id ? await getMedia(s.logo_media_id) : null;
  const preview = upcomingSlots(s, 7).slice(0, 5);

  return (
    <div className="space-y-5">
      <Flash ok={str(sp.ok)} err={str(sp.err)} />
      <PageHeader title="הגדרות הסוכן" />

      <section className="card flex items-center justify-between gap-3">
        <div>
          <div className="font-bold">{s.agent_enabled ? "הסוכן פועל" : "הסוכן מושהה"}</div>
          <div className="text-sm text-mute">כשהסוכן מושהה – לא נוצרים ולא מתפרסמים פוסטים אוטומטית.</div>
        </div>
        <form action={toggleAgent}>
          <input type="hidden" name="on" value={s.agent_enabled ? "0" : "1"} />
          <input type="hidden" name="back" value="/settings" />
          <SubmitButton className={s.agent_enabled ? "btn-ghost" : "btn-primary"}>{s.agent_enabled ? "עצור" : "הפעל"}</SubmitButton>
        </form>
      </section>

      <form action={saveSettings} className="space-y-5">
        <section className="card space-y-3">
          <h2 className="h2">מצב עבודה</h2>
          {MODES.map((m) => (
            <label key={m.v} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-tech has-[:checked]:bg-tech/10">
              <input type="radio" name="approval_mode" value={m.v} defaultChecked={s.approval_mode === m.v} className="mt-1 h-5 w-5 accent-tech" />
              <span>
                <span className="block font-medium">{m.t}</span>
                <span className="block text-sm text-mute">{m.d}</span>
              </span>
            </label>
          ))}
        </section>

        <section className="card space-y-4">
          <h2 className="h2">תזמון</h2>
          <div>
            <label className="label">ימי פרסום</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d.v} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-line text-sm has-[:checked]:border-tech has-[:checked]:bg-tech/20">
                  <input type="checkbox" name="publish_days" value={d.v} defaultChecked={s.publish_days.includes(d.v)} className="sr-only" />
                  {d.l}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">פוסטים בשבוע</label>
              <input type="number" name="posts_per_week" min={1} max={21} defaultValue={s.posts_per_week} className="input" />
            </div>
            <div>
              <label className="label">שעות פרסום</label>
              <input name="publish_times" defaultValue={s.publish_times.join(", ")} className="input" dir="ltr" placeholder="19:00, 12:30" />
              <p className="hint">שעון ישראל, מופרד בפסיקים</p>
            </div>
            <div>
              <label className="label">להכין מראש (ימים)</label>
              <input type="number" name="plan_ahead_days" min={1} max={14} defaultValue={s.plan_ahead_days} className="input" />
            </div>
          </div>
          <div className="rounded-xl bg-ink-850 p-3 text-sm">
            <div className="mb-1 text-xs text-mute">המשבצות הבאות לפי ההגדרות השמורות:</div>
            {preview.length ? preview.map((p) => <div key={p}>• {formatIL(p)}</div>) : <div className="text-mute">אין משבצות בשבוע הקרוב</div>}
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="h2">תמונות</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">מקור תמונה לפוסטים של הסוכן</label>
              <select name="image_mode" defaultValue={s.image_mode} className="input">
                <option value="ai">תמונת AI חדשה לכל פוסט</option>
                <option value="library">מהספרייה (תמונות אמיתיות, הכי פחות בשימוש)</option>
                <option value="none">בלי תמונה (הפוסט ימתין לבחירה ידנית)</option>
              </select>
            </div>
            <label className="flex items-center gap-3 self-end rounded-xl border border-line p-3 text-sm">
              <input type="checkbox" name="image_headline" defaultChecked={s.image_headline} className="h-5 w-5 accent-tech" />
              כותרת בעברית על התמונה
            </label>
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="h2">מותג ותוכן</h2>
          <div>
            <label className="label">הנעה לפעולה</label>
            <input name="cta_text" defaultValue={s.cta_text} className="input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">טלפון לפרסום</label>
              <input name="phone" defaultValue={s.phone ?? ""} className="input" dir="ltr" inputMode="tel" />
            </div>
            <div>
              <label className="label">אתר</label>
              <input name="website" defaultValue={s.website ?? ""} className="input" dir="ltr" />
            </div>
            <div>
              <label className="label">אזור שירות</label>
              <input name="service_area" defaultValue={s.service_area ?? ""} className="input" placeholder="למשל: מרכז והשרון" />
            </div>
          </div>
          <p className="hint">הסוכן משתמש רק בפרטים שמולאו כאן ולעולם לא ממציא טלפון, אתר או אזור.</p>
          <div>
            <label className="label">האשטגים קבועים</label>
            <input name="brand_hashtags" defaultValue={s.brand_hashtags.join(" ")} className="input" />
          </div>
          <div>
            <label className="label">הנחיות נוספות לסוכן</label>
            <textarea name="extra_instructions" defaultValue={s.extra_instructions ?? ""} rows={4} className="input" placeholder="למשל: להדגיש שירות מהיר, לפנות גם לוועדי בתים…" />
          </div>
        </section>

        <div className="sticky bottom-24 z-10 lg:bottom-4">
          <SubmitButton className="btn-primary w-full shadow-xl">שמור הגדרות</SubmitButton>
        </div>
      </form>

      <section className="card space-y-3">
        <h2 className="h2">לוגו החברה</h2>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.public_url} alt="לוגו" className="max-h-20 rounded-lg bg-ink-800 p-2" />
        )}
        <p className="text-sm text-mute">הלוגו מוטמע בפינת כל תמונה שהמערכת מכינה.</p>
        <UploadForm asLogo />
      </section>
    </div>
  );
}
