import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { blurDataUrl } from "@/lib/media";
import { customerProjects, inspiration } from "@/data/site-content";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DesignerCta } from "@/features/designer/designer-cta";

export const metadata: Metadata = {
  title: t.nav.inspiration,
  description: "חדרים, פרויקטים ושילובי חומרים — כל אחד מהם בנוי מדגמים שיש במלאי.",
  alternates: { canonical: routes.inspiration },
};

export default function InspirationPage() {
  const items = [...inspiration, ...customerProjects];

  return (
    <div className="container-page py-8 md:py-12">
      <Breadcrumbs items={[{ label: t.nav.inspiration, href: routes.inspiration }]} />
      <header className="mt-6 max-w-2xl">
        <h1 className="text-display-sm">{t.home.inspirationTitle}</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          כל חלל כאן מורכב מדגמים אמיתיים מהקטלוג. אהבתם שילוב? פתחו את מעצב החדר
          ובדקו אותו בבית שלכם.
        </p>
        <DesignerCta
          label={t.designer.shortTitle}
          entry="nav"
          size="lg"
          className="mt-6"
        />
      </header>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn(item.orientation === "portrait" && "sm:row-span-2")}
          >
            <figure className="group relative block h-full overflow-hidden rounded-sm bg-surface-2">
              <span
                className={cn(
                  "relative block",
                  item.orientation === "portrait"
                    ? "aspect-4/5 sm:h-full"
                    : "aspect-4/3",
                )}
              >
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  placeholder="blur"
                  blurDataURL={blurDataUrl}
                  className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
                />
              </span>
              <span
                aria-hidden
                className="absolute inset-0 bg-linear-to-t from-ink/72 via-transparent to-transparent"
              />
              <figcaption className="absolute inset-x-0 bottom-0 p-5">
                <span className="block font-display text-lg text-canvas">
                  {item.title}
                </span>
                <span className="mt-1 block text-xs text-canvas/75">
                  {item.description}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-sm text-muted">
        רוצים לראות את השילוב בחלל שלכם?{" "}
        <Link href={routes.designer} className="link-quiet text-ink">
          {t.designer.title}
        </Link>
      </p>
    </div>
  );
}
