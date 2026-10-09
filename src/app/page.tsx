import Link from 'next/link';
import { Logo } from '@/components/brand';
import { HomeSearch } from './home-search';

export const dynamic = 'force-dynamic';

/**
 * Customer home (spec §5, §9, §18).
 *
 * WHAT → WHEN → one button. The category grid that used to sit at the bottom
 * is gone: offering it invites the customer to classify their own problem,
 * which is the job the system exists to do, and a wrong self-classification
 * is worse than no classification. The two extra booking-mode buttons are
 * gone too — "when" is now a property of the request rather than a fork in
 * the flow, which is what it always was.
 */
export default function HomePage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-8">
      <header className="flex items-center justify-between">
        <Logo />
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-ink-2 hover:text-ink"
        >
          התחברות
        </Link>
      </header>

      <div className="mt-10">
        <h1 className="text-[32px] font-black leading-[1.15] text-ink">
          צריך? אנחנו מוצאים.
        </h1>
        <p className="mt-2 text-ink-2">
          תארו מה קרה. נמצא את בעל המקצוע שכבר נמצא באזור שלכם.
        </p>
      </div>

      {/*
        * The picker's floor is set in the browser, not here. Computing it on
        * the server meant computing it in UTC, which is two or three hours
        * off the wall clock the customer is reading.
        */}
      <HomeSearch />

      {/*
        * A way to ask "what do you even do?" without being asked to classify
        * your own problem first. The grid lives on its own screen rather
        * than here, so the home screen stays two questions and a button.
        */}
      <footer className="mt-auto flex flex-wrap items-center justify-center gap-1 pt-10 text-center text-xs text-ink-3">
        <Link
          href="/services"
          className="gs-press inline-flex min-h-11 items-center px-4 hover:text-ink-2"
        >
          מה אפשר להזמין
        </Link>
        <span aria-hidden="true" className="text-ink-3/50">·</span>
        <Link
          href="/provider"
          className="gs-press inline-flex min-h-11 items-center px-4 hover:text-ink-2"
        >
          אני בעל מקצוע
        </Link>
      </footer>
    </main>
  );
}
