"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMore } from "./icons";
import { EXTRA, MAIN } from "./nav-links";

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="hidden w-60 shrink-0 flex-col gap-1 border-l border-line bg-ink-900/60 p-4 lg:flex">
      {[...MAIN, ...EXTRA].map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
            active(path, href) ? "bg-tech/15 text-white shadow-[inset_-3px_0_0_var(--color-tech)]" : "text-mute hover:bg-ink-800 hover:text-white"
          }`}
        >
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const moreActive = EXTRA.some((e) => active(path, e.href)) || path === "/more";
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink-950/90 backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {[...MAIN, { href: "/more", label: "עוד", Icon: IconMore }].map(({ href, label, Icon }) => {
          const on = href === "/more" ? moreActive : active(path, href);
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-1 pt-2 pb-1 text-[11px] ${on ? "text-tech-glow" : "text-mute"}`}>
              <Icon className={`h-6 w-6 ${on ? "drop-shadow-[0_0_8px_var(--color-tech)]" : ""}`} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

