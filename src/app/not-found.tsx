import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-4 text-display-sm">{t.states.notFoundTitle}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        {t.states.notFoundBody}
      </p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href={routes.home}>{t.states.notFoundCta}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.catalog}>{t.nav.catalog}</Link>
        </Button>
      </div>
    </div>
  );
}
