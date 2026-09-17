import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  link,
  align = "start",
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  link?: { label: string; href: string };
  align?: "start" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <h2 className="text-display-sm">{title}</h2>
        {subtitle ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{subtitle}</p>
        ) : null}
      </div>
      {link ? (
        <Link
          href={link.href}
          className="link-quiet inline-flex shrink-0 items-center gap-1.5 text-sm text-ink"
        >
          {link.label}
          <ArrowLeft className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
