"use client";

import * as React from "react";
import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="container-page flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <h1 className="text-display-sm">{t.states.errorTitle}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        {t.states.errorBody}
      </p>
      {error.digest ? (
        <p className="num mt-2 text-xs text-muted-soft">#{error.digest}</p>
      ) : null}
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset}>{t.states.retry}</Button>
        <Button asChild variant="outline">
          <Link href={routes.home}>{t.states.notFoundCta}</Link>
        </Button>
      </div>
    </div>
  );
}
