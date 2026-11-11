import Link from "next/link";
import { POST_SELECT, PostCard, type PostRow } from "@/components/post-card";
import { Empty, PageHeader, str, type SP } from "@/components/ui";
import { db } from "@/lib/db";

export default async function HistoryPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filter = str(sp.f) ?? "all";
  const statuses = filter === "live" ? ["published"] : filter === "sim" ? ["simulated"] : ["published", "simulated", "failed"];
  const { data } = await db()
    .from("posts")
    .select(POST_SELECT)
    .in("status", statuses)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(100);
  const posts = (data ?? []) as PostRow[];
  const tabs = [
    { k: "all", l: "הכול" },
    { k: "live", l: "פורסמו באינסטגרם" },
    { k: "sim", l: "סימולציות" },
  ];
  return (
    <div>
      <PageHeader title="היסטוריית פרסומים" subtitle="כל מה שפורסם, נבדק בסימולציה או נכשל" />
      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <Link
            key={t.k}
            href={`/history?f=${t.k}`}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${filter === t.k ? "border-tech bg-tech/15" : "border-line text-mute"}`}
          >
            {t.l}
          </Link>
        ))}
      </div>
      <div className="space-y-3">{posts.length ? posts.map((p) => <PostCard key={p.id} post={p} />) : <Empty>אין עדיין היסטוריה</Empty>}</div>
    </div>
  );
}
