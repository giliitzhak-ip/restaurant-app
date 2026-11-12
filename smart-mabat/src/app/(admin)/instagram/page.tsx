import { connectInstagram, disconnectInstagram, verifyInstagram } from "@/actions/instagram";
import { setLivePublishing } from "@/actions/settings";
import { SubmitButton } from "@/components/submit-button";
import { Flash, ModeBadge, PageHeader, str, type SP } from "@/components/ui";
import { env } from "@/lib/env";
import { REQUIRED_PERMISSIONS } from "@/lib/instagram/graph";
import { formatIL } from "@/lib/scheduler/slots";
import { getConnection, getSettings, publishMode } from "@/lib/settings";

export default async function InstagramPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [settings, conn] = await Promise.all([getSettings(), getConnection()]);
  const mode = publishMode(settings, conn);
  const envLive = env.liveEnabledByEnv();

  return (
    <div className="space-y-5">
      <Flash ok={str(sp.ok)} err={str(sp.err)} />
      <PageHeader title="חיבור אינסטגרם" subtitle="Meta Graph API רשמי · חשבון Business/Creator בלבד" />

      {/* Mode */}
      <section className={`card space-y-3 ${mode.live ? "border-emerald-500/40" : "border-amber-500/30"}`}>
        <div className="flex items-center justify-between">
          <h2 className="h2">מצב פרסום</h2>
          <ModeBadge live={mode.live} />
        </div>
        {mode.live ? (
          <p className="text-sm text-emerald-200">פרסום אמיתי פעיל. פוסטים מאושרים יתפרסמו בחשבון @{conn.username}.</p>
        ) : (
          <>
            <p className="text-sm text-soft">
              מצב בדיקות: המערכת מריצה את כל השלבים (כתיבה, תמונה, בדיקות, תור, תזמון) ומסמנת פוסטים כ״פורסם בסימולציה״ – בלי לשלוח דבר לאינסטגרם.
            </p>
            <ul className="space-y-1 text-sm text-amber-200">
              {mode.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </>
        )}
        <ol className="space-y-1 text-xs text-mute">
          <li className={envLive ? "text-emerald-300" : ""}>{envLive ? "✓" : "1."} PUBLISH_LIVE_ENABLED=true ב-Vercel</li>
          <li className={conn.permissions_ok ? "text-emerald-300" : ""}>{conn.permissions_ok ? "✓" : "2."} חיבור אינסטגרם עם הרשאות מאומתות</li>
          <li className={settings.live_publishing ? "text-emerald-300" : ""}>{settings.live_publishing ? "✓" : "3."} מתג פרסום אמיתי בעמוד זה</li>
        </ol>
        {settings.live_publishing ? (
          <form action={setLivePublishing}>
            <input type="hidden" name="on" value="0" />
            <SubmitButton className="btn-ghost">חזרה למצב בדיקות</SubmitButton>
          </form>
        ) : (
          <form action={setLivePublishing} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="on" value="1" />
            <input name="confirm" className="input sm:max-w-48" placeholder='הקלידו "פרסם"' disabled={!envLive || !conn.permissions_ok} />
            <SubmitButton className="btn-primary" confirm="להפעיל פרסום אמיתי לאינסטגרם?">
              הפעל פרסום אמיתי
            </SubmitButton>
          </form>
        )}
      </section>

      {/* Connection */}
      <section className="card space-y-3">
        <h2 className="h2">סטטוס חיבור</h2>
        {conn.access_token_enc ? (
          <div className="space-y-1 text-sm">
            <div>
              חשבון: <b dir="ltr">@{conn.username ?? "?"}</b> <span className="text-mute">(ID {conn.ig_user_id})</span>
            </div>
            <div>סוג חיבור: {conn.api_host === "instagram" ? "Instagram Login" : "Facebook Login"}</div>
            <div className={conn.permissions_ok ? "text-emerald-300" : "text-red-300"}>
              הרשאות: {conn.permissions_ok ? "תקינות" : "לא תקינות"}
              {conn.permissions.length > 0 && <span className="text-xs text-mute" dir="ltr"> ({conn.permissions.join(", ")})</span>}
            </div>
            {conn.quota_usage !== null && (
              <div className="text-mute">
                מכסת פרסום ב-24 שעות: {conn.quota_usage}/{conn.quota_total ?? "?"}
              </div>
            )}
            <div className="text-mute">אומת לאחרונה: {formatIL(conn.last_verified_at)}</div>
            {conn.token_expires_at && <div className="text-mute">תוקף הטוקן (משוער): {formatIL(conn.token_expires_at)} · מתחדש אוטומטית</div>}
            {conn.last_error && <div className="rounded-lg bg-red-500/10 p-2 text-red-200">{conn.last_error}</div>}
            <div className="flex gap-2 pt-2">
              <form action={verifyInstagram}>
                <SubmitButton className="btn-ghost" pendingText="בודק…">בדוק הרשאות שוב</SubmitButton>
              </form>
              <form action={disconnectInstagram}>
                <SubmitButton className="btn-danger" confirm="לנתק את אינסטגרם?">נתק</SubmitButton>
              </form>
            </div>
          </div>
        ) : (
          <p className="text-sm text-mute">לא מחובר.</p>
        )}
      </section>

      <form action={connectInstagram} className="card space-y-4">
        <h2 className="h2">{conn.access_token_enc ? "החלפת טוקן" : "חיבור חשבון"}</h2>
        <p className="text-sm text-mute">
          הטוקן נשמר מוצפן (AES-256-GCM) בשרת בלבד ולא מוצג שוב. בעת החיבור מתבצעות קריאות קריאה-בלבד (זהות, הרשאות, מכסה) – שום דבר לא מתפרסם.
        </p>
        <div>
          <label className="label">סוג חיבור</label>
          <select name="api_host" defaultValue={conn.api_host} className="input">
            <option value="instagram">Instagram API with Instagram Login (מומלץ)</option>
            <option value="facebook">Instagram API with Facebook Login (דרך עמוד פייסבוק)</option>
          </select>
          <p className="hint" dir="ltr">
            Instagram Login: {REQUIRED_PERMISSIONS.instagram.join(", ")}
            <br />
            Facebook Login: {REQUIRED_PERMISSIONS.facebook.join(", ")}
          </p>
        </div>
        <div>
          <label className="label">Access Token (ארוך-טווח)</label>
          <textarea name="token" rows={3} required className="input font-mono text-xs" dir="ltr" autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <label className="label">Instagram User ID (אופציונלי)</label>
          <input name="ig_user_id" className="input" dir="ltr" inputMode="numeric" placeholder="יאותר אוטומטית" />
        </div>
        <SubmitButton pendingText="מאמת מול Meta…">חבר ואמת</SubmitButton>
      </form>
    </div>
  );
}
