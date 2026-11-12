import Link from "next/link";
import { runAgentNow, toggleAgent } from "@/actions/settings";
import { IconPause, IconPlay, IconPlus, IconSpark } from "@/components/icons";
import { POST_SELECT, PostCard, type PostRow } from "@/components/post-card";
import { SubmitButton } from "@/components/submit-button";
import { Empty, Flash, ModeBadge, Stat, str, type SP } from "@/components/ui";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatIL } from "@/lib/scheduler/slots";
import { upcomingSlots } from "@/lib/scheduler/slots";
import { getConnection, getSettings, publishMode } from "@/lib/settings";

const MODE_LABEL = { draft: "טיוטה בלבד", manual: "אישור ידני", auto: "פרסום אוטומטי" };

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [settings, conn] = await Promise.all([getSettings(), getConnection()]);
  const mode = publishMode(settings, conn);

  const count = async (statuses: string[]) =>
    (await db().from("posts").select("id", { count: "exact", head: true }).in("status", statuses)).count ?? 0;
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  const [pending, scheduled, failed, weekPublished, nextRes, lastRun, attention] = await Promise.all([
    count(["pending_approval"]),
    count(["scheduled"]),
    count(["failed"]),
    db().from("posts").select("id", { count: "exact", head: true }).in("status", ["published", "simulated"]).gte("published_at", weekAgo),
    db().from("posts").select(POST_SELECT).eq("status", "scheduled").order("scheduled_at").limit(1),
    db().from("agent_runs").select("*").order("started_at", { ascending: false }).limit(1),
    db().from("posts").select(POST_SELECT).in("status", ["pending_approval", "failed"]).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(5),
  ]);
  const next = (nextRes.data?.[0] as PostRow | undefined) ?? null;
  const run = lastRun.data?.[0];
  const nextSlot = upcomingSlots(settings, 14)[0];

  return (
    <div>
      <Flash ok={str(sp.ok)} err={str(sp.err)} />

      {/* Agent control */}
      <section className="card relative mb-5 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-tech/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${settings.agent_enabled ? "bg-tech shadow-[0_0_12px_var(--color-tech)]" : "bg-zinc-600"}`} />
              <h1 className="text-xl font-bold">{settings.agent_enabled ? "הסוכן פועל" : "הסוכן מושהה"}</h1>
            </div>
            <p className="mt-1 text-sm text-mute">
              מצב עבודה: <b className="text-soft">{MODE_LABEL[settings.approval_mode]}</b> · {settings.posts_per_week} פוסטים בשבוע ·
              שעות {settings.publish_times.join(", ")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mute">
              <ModeBadge live={mode.live} />
              {!mode.live && <span>{mode.reasons[0]}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <form action={toggleAgent}>
              <input type="hidden" name="on" value={settings.agent_enabled ? "0" : "1"} />
              <input type="hidden" name="back" value="/" />
              {settings.agent_enabled ? (
                <SubmitButton className="btn-ghost">
                  <IconPause /> עצור
                </SubmitButton>
              ) : (
                <SubmitButton className="btn-primary">
                  <IconPlay /> הפעל סוכן
                </SubmitButton>
              )}
            </form>
            <form action={runAgentNow}>
              <SubmitButton className="btn-ghost" pendingText="הסוכן עובד…">
                <IconSpark /> הרץ עכשיו
              </SubmitButton>
            </form>
          </div>
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="ממתינים לאישור" value={pending} href="/posts?status=pending_approval" />
        <Stat label="בתור לפרסום" value={scheduled} href="/posts?status=scheduled" />
        <Stat label={mode.live ? "פורסמו השבוע" : "סימולציות השבוע"} value={weekPublished.count ?? 0} href="/history" />
        <Stat label="נכשלו" value={failed} href="/posts?status=failed" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">הפוסט הבא</h2>
            <Link href="/posts/new" className="btn-primary min-h-9 px-3">
              <IconPlus className="h-4 w-4" /> פוסט חדש
            </Link>
          </div>
          {next ? (
            <PostCard post={next} />
          ) : (
            <Empty>
              אין פוסט מתוזמן.
              <br />
              משבצת הפרסום הבאה: {formatIL(nextSlot)}
            </Empty>
          )}
        </section>

        <section>
          <h2 className="h2 mb-3">דורש טיפול</h2>
          <div className="space-y-3">
            {(attention.data as PostRow[] | null)?.length ? (
              (attention.data as PostRow[]).map((p) => <PostCard key={p.id} post={p} />)
            ) : (
              <Empty>הכול מטופל ✨</Empty>
            )}
          </div>
        </section>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="card text-sm">
          <div className="text-xs text-mute">ריצה אחרונה של הסוכן</div>
          <div className="mt-1 font-medium">{run ? formatIL(run.started_at) : "עוד לא רץ"}</div>
          {run && <div className={`mt-1 text-xs ${run.ok ? "text-emerald-300" : "text-red-300"}`}>{run.ok ? "הצליחה" : "עם שגיאות"} · {run.trigger}</div>}
        </div>
        <div className="card text-sm">
          <div className="text-xs text-mute">אינסטגרם</div>
          <div className="mt-1 font-medium">{conn.username ? `@${conn.username}` : "לא מחובר"}</div>
          <div className={`mt-1 text-xs ${conn.permissions_ok ? "text-emerald-300" : "text-amber-300"}`}>
            {conn.permissions_ok ? "הרשאות אומתו" : "נדרש חיבור/אימות"}
          </div>
        </div>
        <div className="card text-sm">
          <div className="text-xs text-mute">מנוע תוכן / תמונות</div>
          <div className="mt-1 font-medium" dir="ltr">
            {env.anthropicKey() ? env.aiModel() : "mock (ללא AI)"}
          </div>
          <div className="mt-1 text-xs text-mute" dir="ltr">
            {env.openaiKey() ? env.imageModel() : "placeholder images"}
          </div>
        </div>
      </section>
    </div>
  );
}
