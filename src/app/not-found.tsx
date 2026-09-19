import Link from 'next/link';
import { Card } from '@/components/ui';
import { Logo } from '@/components/brand';

export const metadata = { title: 'הדף לא נמצא — GET SERVICE' };

/**
 * 404, in the product's own language and direction.
 *
 * The default Next.js page is English and LTR, which in the middle of a
 * Hebrew RTL flow reads as somebody else's website. The most common way to
 * arrive here is a job id that no longer resolves — a stale link, a shared
 * URL — so the way out offered is starting a new request, not a search box
 * that has nothing to search.
 */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Logo className="mb-8" />

      <Card className="text-center">
        <p className="ltr-nums text-5xl font-black text-brand-bright" dir="ltr">
          404
        </p>
        <h1 className="mt-3 text-2xl font-black text-ink">הדף לא נמצא</h1>
        <p className="mt-2.5 text-ink-2">
          יכול להיות שהקישור ישן, או שהפנייה כבר נסגרה.
        </p>

        {/* A styled Link rather than <Link><Button>: nesting a button inside
            an anchor is two interactive elements where the person sees one,
            and screen readers announce it as such. */}
        <Link
          href="/"
          className="mt-6 inline-flex min-h-13 w-full items-center justify-center rounded-2xl bg-brand px-5 text-base font-bold text-bg transition-colors hover:bg-brand-bright"
        >
          חזרה לדף הבית
        </Link>
      </Card>
    </main>
  );
}
