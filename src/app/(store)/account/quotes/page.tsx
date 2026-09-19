import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import type { QuoteStatus } from "@/types/commerce";

export const metadata: Metadata = {
  title: t.account.quotes,
  robots: { index: false, follow: false },
};

const statusLabels: Record<QuoteStatus, string> = {
  NEW: "נקלטה",
  IN_PROGRESS: "בטיפול",
  SENT: "הצעה נשלחה",
  WON: "אושרה",
  LOST: "נסגרה",
};

export default async function AccountQuotesPage() {
  const user = await getSessionUser();
  /*
   * Guarded here as well as in the layout. A layout redirect is resolved after
   * the shell has streamed, so on its own it can leave the page rendering for
   * an unauthenticated visitor; the page-level check is what actually keeps
   * the data out of the response.
   */
  if (!user) redirect(`${routes.login}?next=${encodeURIComponent(routes.account.root)}`);
  const quotes = await getRepository().listQuotes(user.id);

  if (!quotes.length) {
    return (
      <EmptyState
        icon={<FileText />}
        title={t.account.quotesEmpty}
        action={
          <Button asChild>
            <Link href={routes.quote}>{t.quote.submit}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <h2 className="text-xl">{t.account.quotes}</h2>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {quotes.map((quote) => (
          <li key={quote.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="num text-sm text-ink">{quote.number}</p>
              <p className="num mt-0.5 text-xs text-muted">
                {formatDate(quote.createdAt)}
                {quote.productName ? ` · ${quote.productName}` : ""}
                {quote.areaSqm ? ` · ${formatArea(quote.areaSqm)}` : ""}
              </p>
            </div>
            <Badge variant={quote.status === "WON" ? "success" : "neutral"}>
              {statusLabels[quote.status]}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
