import Link from "next/link";
import { categoryLabel } from "@/lib/content/topics";
import { formatIL } from "@/lib/scheduler/slots";
import type { Post } from "@/lib/types";
import { StatusBadge } from "./ui";

export type PostRow = Post & { media_assets?: { public_url: string } | null };

export const POST_SELECT = "*, media_assets(public_url)";

export function PostCard({ post }: { post: PostRow }) {
  const img = post.media_assets?.public_url;
  const failed = post.checks.filter((c) => !c.ok && c.severity === "error").length;
  return (
    <Link href={`/posts/${post.id}`} className="card flex gap-3 transition hover:border-tech/40">
      <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-ink-800">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-mute">אין תמונה</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={post.status} />
          <span className="text-xs text-mute">{categoryLabel(post.category)}</span>
        </div>
        <div className="mt-1.5 line-clamp-1 font-medium">{post.topic ?? post.hook ?? "ללא נושא"}</div>
        <div className="mt-0.5 line-clamp-2 text-sm text-mute">{post.caption}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
          <span>🕒 {formatIL(post.published_at ?? post.scheduled_at)}</span>
          {failed > 0 && <span className="text-red-300">⚠ {failed} בדיקות נכשלו</span>}
          {post.last_error && post.status !== "published" && <span className="line-clamp-1 text-red-300">{post.last_error}</span>}
        </div>
      </div>
    </Link>
  );
}
