import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { DesignCard } from "@/features/account/design-card";

export const metadata: Metadata = {
  title: t.account.designs,
  robots: { index: false, follow: false },
};

export default async function AccountDesignsPage() {
  const user = await getSessionUser();
  /*
   * Guarded here as well as in the layout. A layout redirect is resolved after
   * the shell has streamed, so on its own it can leave the page rendering for
   * an unauthenticated visitor; the page-level check is what actually keeps
   * the data out of the response.
   */
  if (!user) redirect(`${routes.login}?next=${encodeURIComponent(routes.account.root)}`);
  const designs = await getRepository().listDesigns({ userId: user.id });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-xl">{t.account.designs}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={routes.designer}>
            <Sparkles />
            {t.account.designsEmptyCta}
          </Link>
        </Button>
      </div>

      {designs.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Sparkles />}
          title={t.account.designsEmpty}
          body={t.designer.introBody}
          action={
            <Button asChild>
              <Link href={routes.designer}>{t.account.designsEmptyCta}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-6 sm:grid-cols-2">
          {designs.map((design) => (
            <li key={design.id}>
              <DesignCard design={design} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 rounded-sm border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
        {t.designer.privacyBody}{" "}
        <Link href={routes.privacy} className="link-quiet underline">
          {t.designer.privacyLink}
        </Link>
      </p>
    </div>
  );
}
