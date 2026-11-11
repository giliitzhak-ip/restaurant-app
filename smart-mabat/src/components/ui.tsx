import Link from "next/link";
import { STATUS_LABELS, type PostStatus } from "@/lib/types";

const STATUS_STYLE: Record<PostStatus, string> = {
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  pending_approval: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  scheduled: "bg-tech/15 text-tech-glow border-tech/40",
  publishing: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  published: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  simulated: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  rejected: "bg-zinc-600/20 text-zinc-400 border-zinc-600/40",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ModeBadge({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> LIVE
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300">
      <span className="h-2 w-2 rounded-full bg-amber-400" /> מצב בדיקות
    </span>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
        err ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      }`}
    >
      {err ?? ok}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const inner = (
    <div className="card h-full transition hover:border-tech/40">
      <div className="text-xs text-mute">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-mute">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card py-10 text-center text-sm text-mute">{children}</div>;
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
export function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
