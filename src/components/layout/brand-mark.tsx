import Link from "next/link";
import { brand } from "@/config/brand";
import { routes } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Typographic wordmark. It is a component rather than an image so it inherits
 * the current colour (dark header, light footer, studio chrome) and stays
 * crisp at any size. `public/brand/logo.svg` holds the same mark for OG
 * images and e-mail — replace both when the real logo lands.
 */
export function BrandMark({
  className,
  size = "md",
  withTagline = false,
  href = routes.home,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  withTagline?: boolean;
  href?: string | null;
}) {
  const content = (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span
        className="font-display tracking-[0.14em]"
        style={{
          fontSize: size === "sm" ? "1rem" : size === "lg" ? "1.75rem" : "1.25rem",
        }}
      >
        {brand.nameLatin}
      </span>
      <span
        className="mt-1 tracking-[0.3em] opacity-60"
        style={{ fontSize: size === "sm" ? "0.5rem" : "0.5625rem" }}
      >
        {withTagline ? brand.tagline : "SURFACES"}
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label={`${brand.nameLatin} — ${brand.tagline}`}>
      {content}
    </Link>
  );
}
