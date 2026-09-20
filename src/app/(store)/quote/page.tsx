import type { Metadata } from "next";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getRepository } from "@/server/repositories";
import { QuoteForm } from "@/features/quotes/quote-form";

export const metadata: Metadata = {
  title: t.quote.title,
  description: t.quote.subtitle,
  alternates: { canonical: routes.quote },
};

export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; design?: string; sqm?: string }>;
}) {
  const { product: productSlug, design: designId, sqm } = await searchParams;
  const repository = getRepository();

  const [{ items }, product, design] = await Promise.all([
    repository.listProducts({ limit: 100, sort: "popular" }),
    productSlug ? repository.getProductBySlug(productSlug) : Promise.resolve(null),
    designId ? repository.getDesign(designId) : Promise.resolve(null),
  ]);

  return (
    <div className="container-page py-8 md:py-12">
      <Breadcrumbs items={[{ label: t.quote.title, href: routes.quote }]} />
      <div className="mt-6 grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <div>
          <h1 className="text-display-sm">{t.quote.title}</h1>
          <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
            {t.quote.subtitle}
          </p>
          <div className="mt-10">
            <QuoteForm
              products={items.map((item) => ({
                id: item.id,
                name: item.name,
                slug: item.slug,
              }))}
              defaultProductId={product?.id}
              design={design}
              defaultAreaSqm={
                sqm ? Number(sqm) : (design?.estimatedAreaSqm ?? undefined)
              }
            />
          </div>
        </div>

        <aside className="card p-6 lg:sticky lg:top-24 lg:h-fit">
          <h2 className="text-lg">איך זה עובד</h2>
          <ol className="mt-4 space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="num text-muted">01</span>
              <span className="text-ink-soft">
                אתם שולחים מ״ר, עיר וכמה מילים על החלל.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="num text-muted">02</span>
              <span className="text-ink-soft">
                אנחנו חוזרים בתוך יום עסקים עם שתי–שלוש המלצות מדויקות ומחיר.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="num text-muted">03</span>
              <span className="text-ink-soft">
                אם ביקשתם התקנה — נוסיף אומדן לפי מ״ר, שנסגר סופית אחרי מדידה.
              </span>
            </li>
          </ol>
          <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-muted">
            אין התחייבות ואין תשלום בשלב הזה. אם יצרתם הדמיה במעצב החדר, אפשר לצרף
            אותה והיא תגיע אלינו עם הבקשה.
          </p>
        </aside>
      </div>
    </div>
  );
}
