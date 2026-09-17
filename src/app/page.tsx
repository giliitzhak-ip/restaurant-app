import Link from 'next/link';
import { Logo } from '@/components/brand';
import { withAnon } from '@/lib/db';
import { logOperation } from '@/lib/logger';
import { HomeSearch } from './home-search';

export const dynamic = 'force-dynamic';

interface CategoryRow {
  slug: string;
  name_he: string;
  supports_now: boolean;
}

/**
 * Customer home (spec §9).
 *
 * Deliberately almost empty: one question, one input, three ways to proceed,
 * and a short list of popular trades. No category grid, no adverts, no
 * onboarding carousel — the target is a first-time request in under 60
 * seconds (spec §8).
 */
export default async function HomePage() {
  // Popular trades only, and read anonymously: the catalog is public.
  //
  // A failure here is logged rather than silently swallowed. An earlier
  // version returned [] on any error, which meant a missing `anon` grant
  // rendered a perfectly healthy-looking page with no categories at all —
  // the kind of silent degradation spec §53 warns about.
  let categories: CategoryRow[] = [];
  try {
    categories = await withAnon((db) =>
      db.many<CategoryRow>(
        `select slug, name_he, supports_now
           from categories
          where is_active
          order by sort_order
          limit 6`,
      ),
    );
  } catch (error) {
    logOperation({
      operation: 'home.categories',
      result: 'error',
      errorCode: 'CATALOG_UNAVAILABLE',
      meta: { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
    });
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-slate-300 hover:text-white"
        >
          התחברות
        </Link>
      </header>

      <div className="mt-12">
        <h1 className="text-3xl font-black leading-tight text-white">מה צריך לעשות?</h1>
        <p className="mt-2 text-slate-400">
          תארו מה קרה. אנחנו נמצא את בעל המקצוע המתאים שכבר נמצא באזור שלכם.
        </p>
      </div>

      <HomeSearch categories={categories} />

      <footer className="mt-auto pt-10 text-center text-xs text-slate-500">
        <Link
          href="/provider"
          className="inline-flex min-h-11 items-center px-4 hover:text-slate-300"
        >
          אני בעל מקצוע
        </Link>
      </footer>
    </main>
  );
}
