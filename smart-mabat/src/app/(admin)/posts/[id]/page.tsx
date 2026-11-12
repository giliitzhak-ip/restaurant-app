import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approvePost,
  backToDraft,
  deletePost,
  publishNow,
  regenerateImage,
  rejectPost,
  savePost,
  useLibraryImage,
} from "@/actions/posts";
import { IconCheck, IconX } from "@/components/icons";
import { POST_SELECT, type PostRow } from "@/components/post-card";
import { SubmitButton } from "@/components/submit-button";
import { Flash, ModeBadge, StatusBadge, str, type SP } from "@/components/ui";
import { categoryLabel } from "@/lib/content/topics";
import { db } from "@/lib/db";
import { finalCaption } from "@/lib/instagram/publisher";
import { formatIL, utcToLocalInput } from "@/lib/scheduler/slots";
import { getConnection, getSettings, publishMode } from "@/lib/settings";
import type { MediaAsset } from "@/lib/types";

export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const { data } = await db().from("posts").select(POST_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const post = data as PostRow;
  const [settings, conn, logs, uploads] = await Promise.all([
    getSettings(),
    getConnection(),
    db().from("activity_log").select("*").eq("post_id", id).order("created_at", { ascending: false }).limit(20),
    db().from("media_assets").select("id, title, public_url").eq("kind", "upload").order("created_at", { ascending: false }).limit(24),
  ]);
  const mode = publishMode(settings, conn);
  const locked = ["published", "publishing"].includes(post.status);
  const errors = post.checks.filter((c) => !c.ok && c.severity === "error");

  return (
    <div className="space-y-5">
      <Flash ok={str(sp.ok)} err={str(sp.err)} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/posts" className="text-sm text-mute">
          → חזרה
        </Link>
        <StatusBadge status={post.status} />
        <span className="text-xs text-mute">{categoryLabel(post.category)}</span>
        <span className="text-xs text-mute">· {post.created_by === "agent" ? `נוצר ע״י הסוכן (${post.ai_model})` : "נכתב ידנית"}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Instagram-style preview */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-line bg-ink-900">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
              <span className="h-7 w-7 rounded-full border border-tech/50 bg-ink-800" />
              <b dir="ltr">{conn.username ?? "smartmabat"}</b>
            </div>
            <div className="aspect-[4/5] bg-ink-800">
              {post.media_assets?.public_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.media_assets.public_url} alt={post.alt_text ?? ""} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-mute">אין תמונה</div>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap">
              {finalCaption(post, settings)}
            </div>
          </div>
          {!locked && (
            <div className="grid grid-cols-1 gap-2">
              <form action={regenerateImage}>
                <input type="hidden" name="id" value={post.id} />
                <SubmitButton className="btn-ghost w-full" pendingText="יוצר תמונה…">
                  צור תמונת AI חדשה
                </SubmitButton>
              </form>
              {(uploads.data ?? []).length > 0 && (
                <details className="card p-3">
                  <summary className="cursor-pointer text-sm text-soft">בחר תמונה אמיתית מהספרייה</summary>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {(uploads.data as Pick<MediaAsset, "id" | "title" | "public_url">[]).map((m) => (
                      <form key={m.id} action={useLibraryImage}>
                        <input type="hidden" name="id" value={post.id} />
                        <input type="hidden" name="media_id" value={m.id} />
                        <button className="aspect-square w-full overflow-hidden rounded-lg border border-line hover:border-tech">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.public_url} alt={m.title ?? ""} className="h-full w-full object-cover" loading="lazy" />
                        </button>
                      </form>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* Actions */}
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="text-mute">מועד: </span>
                <b>{formatIL(post.published_at ?? post.scheduled_at)}</b>
              </div>
              <ModeBadge live={mode.live} />
            </div>
            {post.ig_permalink && (
              <a href={post.ig_permalink} target="_blank" rel="noreferrer" className="block text-sm text-tech-glow underline" dir="ltr">
                {post.ig_permalink}
              </a>
            )}
            {post.last_error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{post.last_error}</p>}
            {!locked && (
              <div className="flex flex-wrap gap-2">
                {post.status !== "scheduled" && post.status !== "rejected" && (
                  <form action={approvePost}>
                    <input type="hidden" name="id" value={post.id} />
                    <SubmitButton className="btn-primary" pendingText="בודק…">
                      <IconCheck className="h-4 w-4" /> אשר ותזמן
                    </SubmitButton>
                  </form>
                )}
                {["scheduled", "failed", "pending_approval", "draft"].includes(post.status) && (
                  <form action={publishNow}>
                    <input type="hidden" name="id" value={post.id} />
                    <SubmitButton
                      className="btn-ghost"
                      pendingText={mode.live ? "מפרסם…" : "מריץ סימולציה…"}
                      confirm={mode.live ? "לפרסם עכשיו באינסטגרם? פעולה זו אמיתית." : undefined}
                    >
                      {mode.live ? "פרסם עכשיו" : "בדיקת פרסום (סימולציה)"}
                    </SubmitButton>
                  </form>
                )}
                {post.status !== "rejected" && (
                  <form action={rejectPost}>
                    <input type="hidden" name="id" value={post.id} />
                    <SubmitButton className="btn-ghost">
                      <IconX className="h-4 w-4" /> דחה
                    </SubmitButton>
                  </form>
                )}
                {post.status !== "draft" && (
                  <form action={backToDraft}>
                    <input type="hidden" name="id" value={post.id} />
                    <SubmitButton className="btn-ghost">לטיוטה</SubmitButton>
                  </form>
                )}
                <form action={deletePost}>
                  <input type="hidden" name="id" value={post.id} />
                  <SubmitButton className="btn-danger" confirm="למחוק את הפוסט?">
                    מחק
                  </SubmitButton>
                </form>
              </div>
            )}
          </section>

          {/* Checks */}
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h2">בדיקות תוכן</h2>
              <span className={`text-sm font-bold ${post.checks_passed ? "text-emerald-300" : "text-red-300"}`}>
                {post.checks_passed ? "עבר ✓" : `${errors.length} חוסמות`}
              </span>
            </div>
            <ul className="space-y-1.5 text-sm">
              {post.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <span className={c.ok ? "text-emerald-400" : c.severity === "error" ? "text-red-400" : "text-amber-400"}>
                    {c.ok ? "✓" : c.severity === "error" ? "✕" : "!"}
                  </span>
                  <span className={c.ok ? "text-soft" : ""}>
                    {c.label}
                    {c.detail && <span className="text-xs text-mute"> · {c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Edit */}
          {!locked && (
            <form action={savePost} className="card space-y-4">
              <input type="hidden" name="id" value={post.id} />
              <h2 className="h2">עריכה</h2>
              <div>
                <label className="label">טקסט</label>
                <textarea name="caption" defaultValue={post.caption} rows={10} className="input leading-relaxed" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">כותרת על התמונה</label>
                  <input name="headline" defaultValue={post.headline ?? ""} className="input" />
                  <p className="hint">שינוי כותרת יחול בתמונה הבאה שתיווצר</p>
                </div>
                <div>
                  <label className="label">מועד (שעון ישראל)</label>
                  <input type="datetime-local" name="scheduled_at" defaultValue={utcToLocalInput(post.scheduled_at)} className="input" />
                </div>
              </div>
              <div>
                <label className="label">האשטגים</label>
                <input name="hashtags" defaultValue={post.hashtags.join(" ")} className="input" />
                <p className="hint">האשטגים קבועים של המותג מתווספים אוטומטית</p>
              </div>
              <div>
                <label className="label">טקסט חלופי לתמונה (נגישות)</label>
                <input name="alt_text" defaultValue={post.alt_text ?? ""} className="input" />
              </div>
              {post.status === "scheduled" && <p className="hint">שמירה תחזיר את הפוסט לאישור ידני.</p>}
              <SubmitButton pendingText="שומר ובודק…">שמור</SubmitButton>
            </form>
          )}

          {/* Log */}
          <section className="card">
            <h2 className="h2 mb-3">יומן</h2>
            <ul className="space-y-2 text-sm">
              {(logs.data ?? []).map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="shrink-0 text-xs text-mute tabular-nums">{formatIL(l.created_at, false)}</span>
                  <span className={l.level === "error" ? "text-red-300" : l.level === "warn" ? "text-amber-300" : "text-soft"}>{l.message}</span>
                </li>
              ))}
              {!logs.data?.length && <li className="text-mute">אין רשומות</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
