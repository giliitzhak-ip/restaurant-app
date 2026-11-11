import Link from "next/link";
import { logout } from "@/actions/auth";
import { BottomNav, Sidebar } from "@/components/nav";
import { ModeBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getConnection, getSettings, publishMode } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [settings, conn] = await Promise.all([getSettings(), getConnection()]);
  const mode = publishMode(settings, conn);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-ink-950/85 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-tech/40 bg-ink-900">
              <span className="h-3 w-3 rounded-full bg-tech shadow-[0_0_12px_var(--color-tech)]" />
            </span>
            <span className="leading-tight">
              <span className="block text-[10px] font-bold tracking-[0.25em] text-tech-glow">SMART MABAT</span>
              <span className="block text-sm font-bold">מבט חכם</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span
              className={`hidden rounded-full border px-2.5 py-1 text-xs sm:inline-flex ${
                settings.agent_enabled ? "border-tech/40 text-tech-glow" : "border-line text-mute"
              }`}
            >
              {settings.agent_enabled ? "הסוכן פעיל" : "הסוכן מושהה"}
            </span>
            <Link href="/instagram">
              <ModeBadge live={mode.live} />
            </Link>
            <form action={logout}>
              <button className="hidden rounded-lg px-2 py-1 text-xs text-mute hover:text-white lg:block">יציאה</button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <Sidebar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 lg:px-8 lg:pb-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
