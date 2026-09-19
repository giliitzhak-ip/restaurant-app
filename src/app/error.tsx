'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button, Card } from '@/components/ui';
import { Logo } from '@/components/brand';

/**
 * The screen that renders when a route segment throws.
 *
 * Without this file Next.js falls back to its own error page: English,
 * left-to-right, unbranded, and in production a bare "Application error"
 * with no way forward but the back button. For a product whose whole promise
 * is that somebody is coming, that is the worst moment to look abandoned.
 *
 * It claims nothing about what went wrong, because it does not know. The
 * digest is shown when there is one — that is the only string that connects
 * what the person saw to what the server logged, and asking for it is how a
 * support conversation stops being guesswork.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side reporting, which in production is the only place this
    // error exists at all — a server-side throw is already in the server log,
    // but a render that fails in the browser is not.
    console.error('[get-service] unhandled error', error);
  }, [error]);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Logo className="mb-8" />

      <Card className="text-center">
        <h1 className="text-2xl font-black text-ink">משהו השתבש</h1>
        <p className="mt-2.5 text-ink-2">
          התקלה אצלנו, לא אצלכם. אפשר לנסות שוב — ואם זה חוזר, נסו שוב בעוד רגע.
        </p>

        <Button className="mt-6" size="lg" fullWidth onClick={reset}>
          נסו שוב
        </Button>

        <Link
          href="/"
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm font-medium text-ink-2 hover:text-ink"
        >
          חזרה לדף הבית
        </Link>

        {error.digest && (
          <p className="mt-5 text-xs text-ink-3">
            מספר שגיאה:{' '}
            <span className="ltr-nums" dir="ltr">
              {error.digest}
            </span>
          </p>
        )}
      </Card>
    </main>
  );
}
