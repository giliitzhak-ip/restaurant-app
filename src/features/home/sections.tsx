import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Camera, Layers, Phone, Wand2 } from "lucide-react";
import { brand } from "@/config/brand";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { blurDataUrl, media } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  customerProjects,
  faq,
  inspiration,
  valueProps,
} from "@/data/site-content";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Rating } from "@/components/ui/rating";
import { SectionHeading } from "@/components/ui/section-heading";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { DesignerCta } from "@/features/designer/designer-cta";
import { ProductRail } from "@/features/catalog/product-rail";
import type { Category, Collection, Product, Review } from "@/types/catalog";

/* ------------------------------ value bar ------------------------------ */

export function ValueBar() {
  return (
    <section className="border-y border-line bg-surface">
      <ul className="container-page grid gap-x-8 gap-y-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {valueProps.map((prop) => (
          <li key={prop.title}>
            <h3 className="text-sm font-medium text-ink">{prop.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{prop.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------ categories ----------------------------- */

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <section className="container-page py-20 md:py-28">
      <SectionHeading
        eyebrow={t.home.categoriesEyebrow}
        title={t.home.categoriesTitle}
        subtitle={t.home.categoriesSubtitle}
        link={{ label: t.nav.catalog, href: routes.catalog }}
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, index) => (
          <li
            key={category.slug}
            className={cn(index === 0 && "sm:col-span-2 lg:col-span-1")}
          >
            <Link
              href={routes.category(category.slug)}
              className="group relative block overflow-hidden rounded-sm bg-surface-2"
            >
              <span
                className={cn(
                  "relative block",
                  index === 0 ? "aspect-4/5 sm:aspect-[16/9] lg:aspect-4/5" : "aspect-4/5",
                )}
              >
                <Image
                  src={category.tileImage}
                  alt={category.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  placeholder="blur"
                  blurDataURL={blurDataUrl}
                  className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
                />
              </span>
              <span
                aria-hidden
                className="absolute inset-0 bg-linear-to-t from-ink/72 via-ink/10 to-transparent"
              />
              <span className="absolute inset-x-0 bottom-0 p-5">
                <span className="block font-display text-2xl text-canvas">
                  {category.name}
                </span>
                <span className="mt-1 block text-xs text-canvas/75">
                  {category.shortDescription}
                </span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-canvas">
                  {t.common.viewAll}
                  <ArrowLeft className="size-3.5 transition-transform duration-500 group-hover:-translate-x-1" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------- designer teaser --------------------------- */

const stepIcons = [Camera, Layers, Wand2];

export function DesignerTeaser() {
  const steps = [
    { title: t.home.tryItStep1Title, body: t.home.tryItStep1Body },
    { title: t.home.tryItStep2Title, body: t.home.tryItStep2Body },
    { title: t.home.tryItStep3Title, body: t.home.tryItStep3Body },
  ];

  return (
    <section className="bg-ink text-canvas">
      <div className="container-page grid items-center gap-12 py-20 md:py-28 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="eyebrow text-canvas/60">{t.home.tryItEyebrow}</p>
          <h2 className="mt-4 text-display-md text-canvas">{t.home.tryItTitle}</h2>
          <p className="mt-4 max-w-lg text-[0.9375rem] leading-relaxed text-canvas/75">
            {t.home.tryItSubtitle}
          </p>

          <ol className="mt-10 space-y-7">
            {steps.map((step, index) => {
              const Icon = stepIcons[index]!;
              return (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-canvas/25">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="flex items-baseline gap-2">
                      <span className="num text-xs text-canvas/45">
                        0{index + 1}
                      </span>
                      <span className="text-[0.9375rem] font-medium text-canvas">
                        {step.title}
                      </span>
                    </span>
                    <span className="mt-1 block max-w-md text-sm leading-relaxed text-canvas/65">
                      {step.body}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>

          <DesignerCta
            label={t.home.tryItCta}
            entry="home"
            size="lg"
            variant="studio"
            className="mt-10"
          />
        </div>

        <div className="relative">
          <div className="relative aspect-4/3 overflow-hidden rounded-sm border border-canvas/15">
            <Image
              src={media.scene("inspiration-media")}
              alt="הדמיה של חדר מדיה עם SPC אלון פחם ופאנל Slat שחור"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              loading="lazy"
              placeholder="blur"
              blurDataURL={blurDataUrl}
              className="object-cover"
            />
          </div>
          <p className="mt-3 text-xs text-canvas/50">
            ההדמיה משתמשת בטקסטורה של המוצר האמיתי — לא בתמונה שנוצרה על ידי AI.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- collections ----------------------------- */

export function CollectionStrip({ collections }: { collections: Collection[] }) {
  return (
    <section className="container-page py-20 md:py-28">
      <SectionHeading
        eyebrow={t.home.collectionsEyebrow}
        title={t.home.collectionsTitle}
        link={{ label: t.nav.collections, href: "/collections" }}
      />
      <ul className="scrollbar-none -mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible md:px-0">
        {collections.slice(0, 4).map((collection) => (
          <li
            key={collection.slug}
            className="w-[72vw] shrink-0 snap-start sm:w-[48vw] md:w-auto"
          >
            <Link href={routes.collection(collection.slug)} className="group block">
              <span className="relative block aspect-3/4 overflow-hidden rounded-sm bg-surface-2">
                <Image
                  src={collection.heroImage}
                  alt={collection.name}
                  fill
                  sizes="(max-width: 768px) 72vw, 25vw"
                  loading="lazy"
                  placeholder="blur"
                  blurDataURL={blurDataUrl}
                  className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
                />
              </span>
              <span className="mt-3.5 block font-display text-lg text-ink">
                {collection.name}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                {collection.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------- product sections -------------------------- */

export function ProductSection({
  eyebrow,
  title,
  subtitle,
  href,
  products,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  href: string;
  products: Product[];
  className?: string;
}) {
  if (!products.length) return null;
  return (
    <section className={cn("container-page py-20 md:py-24", className)}>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        link={{ label: t.common.viewAll, href }}
      />
      <div className="mt-10">
        <ProductRail products={products} />
      </div>
    </section>
  );
}

/* ----------------------------- before/after ---------------------------- */

export function BeforeAfterSection() {
  return (
    <section className="container-page py-20 md:py-28">
      <SectionHeading
        eyebrow={t.home.beforeAfterEyebrow}
        title={t.home.beforeAfterTitle}
        subtitle={t.home.beforeAfterSubtitle}
      />
      <div className="mt-10">
        <BeforeAfterSlider
          className="aspect-3/2 w-full md:aspect-[21/9]"
          before={
            <Image
              src={media.scene("before")}
              alt="החדר לפני — רצפת בטון אפורה"
              fill
              sizes="100vw"
              loading="lazy"
              className="object-cover"
            />
          }
          after={
            <Image
              src={media.scene("after")}
              alt="החדר אחרי — אלון מעושן כהה וחיפוי טרוורטין"
              fill
              sizes="100vw"
              loading="lazy"
              className="object-cover"
            />
          }
        />
      </div>
    </section>
  );
}

/* ------------------------------ editorial ------------------------------ */

export function InspirationGrid() {
  return (
    <section className="container-page py-20 md:py-24">
      <SectionHeading
        eyebrow={t.home.inspirationEyebrow}
        title={t.home.inspirationTitle}
        link={{ label: t.nav.inspiration, href: routes.inspiration }}
      />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {inspiration.slice(0, 6).map((item) => (
          <li
            key={item.key}
            className={cn(item.orientation === "portrait" && "sm:row-span-2")}
          >
            <figure className="group relative block h-full overflow-hidden rounded-sm bg-surface-2">
              <span
                className={cn(
                  "relative block",
                  item.orientation === "portrait" ? "aspect-4/5 sm:h-full" : "aspect-4/3",
                )}
              >
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  loading="lazy"
                  placeholder="blur"
                  blurDataURL={blurDataUrl}
                  className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
                />
              </span>
              <span
                aria-hidden
                className="absolute inset-0 bg-linear-to-t from-ink/70 via-transparent to-transparent"
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
    </section>
  );
}

export function CustomerProjects() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="container-page py-20 md:py-24">
        <SectionHeading
          eyebrow={t.home.projectsEyebrow}
          title={t.home.projectsTitle}
        />
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {customerProjects.map((project) => (
            <li key={project.key}>
              <figure>
                <span className="relative block aspect-3/2 overflow-hidden rounded-sm bg-surface-2">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    loading="lazy"
                    placeholder="blur"
                    blurDataURL={blurDataUrl}
                    className="object-cover"
                  />
                </span>
                <figcaption className="mt-3.5">
                  <span className="block text-[0.9375rem] font-medium text-ink">
                    {project.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {project.description}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------- reviews ------------------------------- */

export function ReviewsSection({ reviews }: { reviews: Review[] }) {
  if (!reviews.length) return null;
  return (
    <section className="container-page py-20 md:py-24">
      <SectionHeading eyebrow={t.home.reviewsEyebrow} title={t.home.reviewsTitle} />
      <ul className="scrollbar-none -mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0">
        {reviews.slice(0, 6).map((review) => (
          <li
            key={review.id}
            className="w-[80vw] shrink-0 snap-start sm:w-[52vw] md:w-auto"
          >
            <figure className="flex h-full flex-col rounded-sm border border-line bg-surface p-6">
              <Rating value={review.rating} />
              <blockquote className="mt-4 flex-1">
                <p className="font-display text-lg leading-snug text-ink">
                  {review.title}
                </p>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  {review.body}
                </p>
              </blockquote>
              <figcaption className="mt-5 text-xs text-muted">
                {review.authorName} · {review.city}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------- faq --------------------------------- */

export function FaqSection({ limit = 6 }: { limit?: number }) {
  return (
    <section className="container-page py-20 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <SectionHeading
          eyebrow={t.home.faqEyebrow}
          title={t.home.faqTitle}
          link={{ label: t.common.viewAll, href: routes.faq }}
          className="lg:flex-col lg:items-start"
        />
        <Accordion type="single" collapsible className="border-t border-line">
          {faq.slice(0, limit).map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ----------------------------- consult CTA ----------------------------- */

export function ConsultCta() {
  return (
    <section className="container-page pb-24">
      <div className="relative isolate overflow-hidden rounded-lg bg-forest px-6 py-14 text-canvas md:px-14 md:py-20">
        <div className="relative max-w-xl">
          <p className="eyebrow text-canvas/60">{t.home.consultEyebrow}</p>
          <h2 className="mt-4 text-display-sm text-canvas">{t.home.consultTitle}</h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-canvas/80">
            {t.home.consultBody}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" variant="studio">
              <Link href={routes.quote}>{t.home.consultCta}</Link>
            </Button>
            <a
              href={brand.contact.phoneHref}
              className="inline-flex items-center gap-2 text-sm text-canvas/85"
            >
              <Phone className="size-4" />
              <span className="num">{brand.contact.phone}</span>
              <span className="text-canvas/50">· {t.home.consultSecondary}</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
