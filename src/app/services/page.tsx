import Link from 'next/link';
import { Logo } from '@/components/brand';
import { withAnon } from '@/lib/db';
import { ServiceBrowser, type BrowseCategory } from './service-browser';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'מה אפשר להזמין — GET SERVICE',
  description: 'כל התחומים והשירותים שאפשר להזמין דרך GET SERVICE, עם מחיר מוערך לכל שירות.',
};

/**
 * The catalogue, browsable.
 *
 * The home screen deliberately has no category grid: asking customers to
 * classify their own problem is asking them to do the job the system exists
 * to do, and a wrong self-classification is worse than none (UX_PRINCIPLES).
 * That decision stands — this is a SEPARATE screen, for a different question.
 * "What do you actually do?" is fair to ask a marketplace before trusting it
 * with a leak at midnight, and the answer was previously nowhere on the site.
 *
 * Every tile leads to something genuinely bookable. The rows come from
 * `categories` joined to `services`, and the HAVING clause drops any trade
 * with nothing under it — so a tile can never open onto an empty list, and
 * nothing is advertised that dispatch could not actually fill.
 */
export default async function ServicesPage() {
  const rows = await withAnon(async (db) =>
    db.many<{
      slug: string;
      name_he: string;
      service_count: string;
      services: string;
    }>(
      `select c.slug, c.name_he,
              count(s.id)::text as service_count,
              coalesce(
                json_agg(
                  json_build_object('slug', s.slug, 'name', s.name_he,
                                    'price', s.base_price_ils)
                  order by s.base_price_ils nulls last, s.name_he
                ) filter (where s.id is not null),
                '[]'
              )::text as services
         from categories c
         join services s on s.category_id = c.id and s.is_active
        where c.is_active
        group by c.slug, c.name_he
       having count(s.id) > 0
        order by c.name_he`,
    ),
  );

  const categories: BrowseCategory[] = rows.map((row) => ({
    slug: row.slug,
    name: row.name_he,
    serviceCount: Number(row.service_count),
    services: (JSON.parse(row.services) as { slug: string; name: string; price: string | null }[]).map(
      (s) => ({ slug: s.slug, name: s.name, price: s.price === null ? null : Number(s.price) }),
    ),
  }));

  const totalServices = categories.reduce((sum, c) => sum + c.serviceCount, 0);

  return (
    <main id="main" className="mx-auto min-h-dvh max-w-2xl px-5 pb-16 pt-7">
      <header className="flex items-center justify-between">
        <Logo />
        <Link
          href="/"
          className="gs-press inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-ink-2 hover:text-ink"
        >
          חזרה
        </Link>
      </header>

      <div className="mt-8">
        <h1 className="text-[30px] font-black leading-[1.15] text-ink">מה אפשר להזמין</h1>
        <p className="mt-2 text-ink-2">
          <span className="ltr-nums" dir="ltr">
            {categories.length}
          </span>{' '}
          תחומים,{' '}
          <span className="ltr-nums" dir="ltr">
            {totalServices}
          </span>{' '}
          שירותים — בעלי מקצוע מאומתים בכל הארץ.
        </p>
      </div>

      <ServiceBrowser categories={categories} />

      <p className="mt-10 text-center text-[13px] leading-relaxed text-ink-3">
        המחירים הם הערכה לפי הקטלוג. המחיר הסופי הוא של בעל המקצוע שיאשר את
        העבודה, ויוצג לאישורכם לפני שמישהו יוצא לדרך.
      </p>
    </main>
  );
}
