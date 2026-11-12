import Link from "next/link";
import { deleteMedia } from "@/actions/media";
import { SubmitButton } from "@/components/submit-button";
import { UploadForm } from "@/components/upload-form";
import { Empty, Flash, PageHeader, str, type SP } from "@/components/ui";
import { db } from "@/lib/db";
import type { MediaAsset } from "@/lib/types";

const KINDS = [
  { k: "upload", l: "תמונות אמיתיות" },
  { k: "branded", l: "מוכנות לפרסום" },
  { k: "ai", l: "נוצרו ב-AI" },
  { k: "logo", l: "לוגו" },
];

export default async function MediaPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const kind = KINDS.find((k) => k.k === str(sp.k))?.k ?? "upload";
  const { data } = await db().from("media_assets").select("*").eq("kind", kind).order("created_at", { ascending: false }).limit(90);
  const media = (data ?? []) as MediaAsset[];

  return (
    <div className="space-y-5">
      <Flash ok={str(sp.ok)} err={str(sp.err)} />
      <PageHeader title="ספריית תמונות" subtitle="העלו תמונות אמיתיות מהשטח – הסוכן ישתמש בהן במצב 'ספרייה'" />
      <section className="card">
        <UploadForm />
      </section>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {KINDS.map((k) => (
          <Link
            key={k.k}
            href={`/media?k=${k.k}`}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${kind === k.k ? "border-tech bg-tech/15" : "border-line text-mute"}`}
          >
            {k.l}
          </Link>
        ))}
      </div>
      {media.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((m) => (
            <div key={m.id} className="overflow-hidden rounded-2xl border border-line bg-ink-900">
              <a href={m.public_url} target="_blank" rel="noreferrer" className="block aspect-[4/5] bg-ink-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.public_url} alt={m.title ?? ""} className="h-full w-full object-cover" loading="lazy" />
              </a>
              <div className="space-y-1 p-2.5">
                <div className="line-clamp-1 text-xs">{m.title ?? "—"}</div>
                <div className="flex items-center justify-between text-[11px] text-mute">
                  <span>{m.width}×{m.height}</span>
                  {kind === "upload" && <span>שימושים: {m.use_count}</span>}
                </div>
                <form action={deleteMedia}>
                  <input type="hidden" name="id" value={m.id} />
                  <SubmitButton className="btn-danger min-h-8 w-full text-xs" confirm="למחוק את התמונה?">
                    מחק
                  </SubmitButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>אין תמונות בקטגוריה הזו</Empty>
      )}
    </div>
  );
}
