import Link from "next/link";
import { LayoutGrid, Activity, UserRound, FolderKanban } from "lucide-react";
import { Logo } from "./logo";
import { AiDisclosure } from "./ai-disclosure";
import { LogoutButton } from "@/components/auth/logout-button";
import type { SessionUser } from "@/lib/session";
import { freeMode } from "@/server/billing";

const NAV = [
  { href: "/dashboard", label: "סטודיו", icon: LayoutGrid },
  { href: "/projects", label: "פרויקטים", icon: FolderKanban },
  { href: "/system", label: "מצב מערכת", icon: Activity },
  { href: "/account", label: "החשבון שלי", icon: UserRound },
];

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-steel/60 bg-ink/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo href="/dashboard" />
          <nav className="hidden items-center gap-1 md:flex" aria-label="ניווט ראשי">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-pearl/80 hover:bg-steel hover:text-pearl">
                <Icon className="size-4 text-gold" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {freeMode() && (
              <Link href="/system#free-mode" className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success ring-1 ring-success/30" title="פעולות בתשלום חסומות">
                מצב חינמי
              </Link>
            )}
            <span className="hidden text-sm text-ash sm:inline">שלום, {user.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 md:pb-10">{children}</main>
      <AiDisclosure />

      {/* Mobile bottom tab bar (iPhone) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-steel/60 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="ניווט תחתון"
      >
        <div className="grid grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-pearl/80">
              <Icon className="size-5 text-gold" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
