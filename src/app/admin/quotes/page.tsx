import type { Metadata } from "next";
import Image from "next/image";
import { t } from "@/i18n";
import { formatArea, formatDateTime } from "@/lib/format";
import { getRepository } from "@/server/repositories";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";
import { QuoteStatusSelect } from "@/features/admin/status-select";
export const metadata: Metadata = {
  title: t.admin.quotes,
  robots: { index: false, follow: false },
};

export default async function AdminQuotesPage() {
  const quotes = await getRepository().listQuotes();

  return (
    <div>
      <AdminPageHeader title={t.admin.quotes} description={`${quotes.length} בקשות`} />
      {quotes.length === 0 ? (
        <p className="text-sm text-muted">אין בקשות עדיין.</p>
      ) : (
        <AdminTable head={["מספר", "לקוח", "פרויקט", "תמונה", "סטטוס"]}>
          {quotes.map((quote) => (
            <tr key={quote.id}>
              <AdminCell>
                <span className="num">{quote.number}</span>
                <p className="num text-xs text-muted">
                  {formatDateTime(quote.createdAt)}
                </p>
              </AdminCell>
              <AdminCell>
                {quote.customerName}
                <p className="num text-xs text-muted">{quote.phone}</p>
                {quote.email ? (
                  <p className="text-xs text-muted">{quote.email}</p>
                ) : null}
              </AdminCell>
              <AdminCell className="text-xs text-muted">
                <p>{quote.city}</p>
                {quote.areaSqm ? <p className="num">{formatArea(quote.areaSqm)}</p> : null}
                {quote.productName ? <p>{quote.productName}</p> : null}
                {quote.wantsInstallation ? (
                  <p className="text-brass">מבקש התקנה</p>
                ) : null}
                {quote.notes ? <p className="mt-1">״{quote.notes}״</p> : null}
              </AdminCell>
              <AdminCell>
                {quote.imageUrl ? (
                  <a href={quote.imageUrl} target="_blank" rel="noreferrer">
                    <span className="relative block size-14 overflow-hidden rounded-xs bg-surface-2">
                      <Image
                        src={quote.imageUrl}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    </span>
                  </a>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </AdminCell>
              <AdminCell>
                <QuoteStatusSelect
                  id={quote.id}
                  status={quote.status}
                  number={quote.number}
                />
              </AdminCell>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
