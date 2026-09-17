import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { brand } from "@/config/brand";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { organizationJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "צור קשר",
  description: `דברו איתנו — ${brand.contact.phone}, ${brand.contact.address}.`,
  alternates: { canonical: routes.contact },
};

export default function ContactPage() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <div className="container-page max-w-4xl py-8 md:py-12">
        <Breadcrumbs items={[{ label: "צור קשר", href: routes.contact }]} />
        <h1 className="mt-6 text-display-sm">{t.nav.callUs}</h1>
        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
          לשאלות על דגם מסוים, לבדיקת מלאי או לתיאום ביקור בשואורום — אנחנו כאן.
          לפרויקט עם מ״ר ותכנון, עדיף לשלוח בקשה להצעת מחיר ונחזור עם הצעה מלאה.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <a
            href={brand.contact.phoneHref}
            className="flex items-start gap-3 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-ink"
          >
            <Phone className="mt-0.5 size-5 text-brass" />
            <span>
              <span className="block text-sm font-medium text-ink">טלפון</span>
              <span className="num mt-0.5 block text-sm text-muted">
                {brand.contact.phone}
              </span>
            </span>
          </a>
          <a
            href={`https://wa.me/${brand.contact.whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-ink"
          >
            <MessageCircle className="mt-0.5 size-5 text-brass" />
            <span>
              <span className="block text-sm font-medium text-ink">וואטסאפ</span>
              <span className="mt-0.5 block text-sm text-muted">
                שליחת תמונה של החלל וקבלת ייעוץ
              </span>
            </span>
          </a>
          <a
            href={`mailto:${brand.contact.email}`}
            className="flex items-start gap-3 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-ink"
          >
            <Mail className="mt-0.5 size-5 text-brass" />
            <span>
              <span className="block text-sm font-medium text-ink">אימייל</span>
              <span className="mt-0.5 block text-sm text-muted">
                {brand.contact.email}
              </span>
            </span>
          </a>
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-5">
            <MapPin className="mt-0.5 size-5 text-brass" />
            <span>
              <span className="block text-sm font-medium text-ink">
                {t.footer.showroom}
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                {brand.contact.address}
              </span>
              <span className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Clock className="size-3.5" />
                {brand.contact.hours}
              </span>
            </span>
          </div>
        </div>

        <div className="mt-10">
          <Button asChild size="lg">
            <Link href={routes.quote}>{t.home.consultCta}</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
