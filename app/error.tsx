'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only safe handle on a server error — never the stack.
    console.error('[app] render error', error.digest ?? error.message);
  }, [error]);

  return (
    <main id="main" className="container-page flex min-h-dvh items-center justify-center py-10">
      <div className="w-full max-w-md space-y-4">
        <ErrorState
          title="משהו השתבש. נסה שוב."
          description={error.digest ? `מזהה תקלה: ${error.digest}` : undefined}
        />
        <Button className="w-full" onClick={reset}>
          טעינה מחדש
        </Button>
      </div>
    </main>
  );
}
