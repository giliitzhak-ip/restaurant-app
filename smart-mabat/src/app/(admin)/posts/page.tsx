import Link from "next/link";
import { IconPlus } from "@/components/icons";
import { POST_SELECT, PostCard, type PostRow } from "@/components/post-card";
import { Empty, Flash, PageHeader, str, type SP } from "@/components/ui";
import { db } from "@/lib/db";
import { STATUS_LABELS, type PostStatus } from "@/lib/types";

const TABS: { key: string; label: string; statuses: PostStatus[] }[] = [
  { key: "upcoming", label: "עתידיים", statuses: ["pending_approval", "scheduled", "draft", "publishing"] },
  { key: "pending_approval", label: STATUS_LABELS.pending_approval, statuses: ["pending_approval"] },
  { key: "scheduled", label: STATUS_LABELS.scheduled, statuses: ["scheduled"] },
  { key: "draft", label: "טיוטות", statuses: ["draft"] },
  { key: "failed", label: STATUS_LABELS.failed, statuses: ["failed"] },
  { key: "rejected", label: "נדחו", statuses: ["rejected"] },
];

export default async function PostsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === str(sp.status)) ?? TABS[0];
  const { data } = await db()
    .from("posts")
    .select(POST_SELECT)
    .in("status", tab.statuses)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);
  const posts = (data ?? []) as PostRow[];

  return (
    <div>
      <Flash ok={str(sp.ok)} err={str(sp.err)} />
      <PageHeader
        title="פוסטים עתידיים"
        subtitle="תור הפרסומים, טיוטות ואישורים"
        action={
          <Link href="/posts/new" className="btn-primary">
            <IconPlus className="h-4 w-4" /> חדש
          </Link>
        }
      />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/posts?status=${t.key}`}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${
              t.key === tab.key ? "border-tech bg-tech/15 text-white" : "border-line text-mute"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="space-y-3">
        {posts.length ? posts.map((p) => <PostCard key={p.id} post={p} />) : <Empty>אין פוסטים כאן</Empty>}
      </div>
    </div>
  );
}
