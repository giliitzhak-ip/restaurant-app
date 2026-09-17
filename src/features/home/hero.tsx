import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { media } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { DesignerCta } from "@/features/designer/designer-cta";

export function Hero({ productCount }: { productCount: number }) {
  return (
    <section className="relative isolate overflow-hidden bg-ink">
      <Image
        src={media.scene("hero-living")}
        alt="סלון עם פרקט אלון נטורל וחיפוי קיר Slat"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-95"
      />
      {/* Scrim: keeps the headline readable without flattening the photo. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-t from-ink/80 via-ink/32 to-ink/10"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          // Darker on the start (right) side, where the Hebrew headline begins.
          background: "linear-gradient(to left, rgba(22,19,15,0.42), transparent 62%)",
        }}
      />

      <div className="container-page relative flex min-h-[86svh] flex-col justify-end pb-12 pt-28 md:min-h-[88svh] md:pb-20">
        <div className="max-w-2xl animate-fade-up">
          <p className="eyebrow text-canvas/70">{t.home.heroEyebrow}</p>
          <h1 className="mt-4 text-display-lg text-canvas">{t.home.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-canvas/85 md:text-lg">
            {t.home.heroSubtitle}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <DesignerCta
              label={t.home.heroPrimaryCta}
              entry="home"
              size="lg"
              variant="studio"
            />
            <Button asChild size="lg" variant="studioOutline">
              <Link href={routes.catalog}>
                {t.home.heroSecondaryCta}
                <ArrowLeft />
              </Link>
            </Button>
          </div>
        </div>

        <dl className="mt-12 grid max-w-3xl grid-cols-3 gap-4 border-t border-canvas/20 pt-6 text-canvas md:mt-16">
          <div>
            <dt className="text-xs text-canvas/60">{t.home.heroStatProducts}</dt>
            <dd className="num mt-1 font-display text-2xl md:text-3xl">
              {productCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-canvas/60">{t.home.heroStatVisualise}</dt>
            <dd className="mt-1 font-display text-2xl md:text-3xl">3 דק׳</dd>
          </div>
          <div>
            <dt className="text-xs text-canvas/60">{t.home.heroStatDelivery}</dt>
            <dd className="num mt-1 font-display text-2xl md:text-3xl">2–5 ימים</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
