import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { faq } from "@/data/site-content";
import { faqJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: t.home.faqTitle,
  description: "כל מה שחשוב לדעת לפני שמזמינים פרקט או חיפוי — מדידה, אספקה, התקנה והחזרות.",
  alternates: { canonical: routes.faq },
};

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(faq)} />
      <div className="container-page max-w-3xl py-8 md:py-12">
        <Breadcrumbs items={[{ label: t.home.faqEyebrow, href: routes.faq }]} />
        <h1 className="mt-6 text-display-sm">{t.home.faqTitle}</h1>

        <div className="mt-10 space-y-10">
          {faq.map((item) => (
            <section key={item.question} id={item.id}>
              <h2 className="text-xl">{item.question}</h2>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">
                {item.answer}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-14 card p-6">
          <h2 className="text-lg">לא מצאתם תשובה?</h2>
          <p className="mt-2 text-sm text-muted">
            שלחו לנו את הפרטים ונחזור אליכם עם תשובה מדויקת לפרויקט שלכם.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href={routes.quote}>{t.home.consultCta}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={routes.contact}>{t.nav.callUs}</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
