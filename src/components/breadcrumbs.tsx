import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { routes } from "@/config/site";

export interface Crumb {
  label: string;
  href?: string;
}

/** Visual breadcrumbs. The matching JSON-LD lives in `@/lib/seo`. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ label: "דף הבית", href: routes.home }, ...items];
  return (
    <nav aria-label="נתיב ניווט">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {all.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {item.href && index < all.length - 1 ? (
              <Link href={item.href} className="transition-colors hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span className="text-ink-soft">{item.label}</span>
            )}
            {index < all.length - 1 ? (
              <ChevronLeft className="size-3 text-muted-soft" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
