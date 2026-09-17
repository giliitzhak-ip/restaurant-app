import type { Metadata } from "next";
import Image from "next/image";
import { t } from "@/i18n";
import { formatArea, formatDateTime } from "@/lib/format";
import { getRepository } from "@/server/repositories";
import { setQuoteStatusAction } from "@/server/actions/admin";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";
import { StatusSelect } from "@/features/admin/status-select";
import type { QuoteStatus } from "@/types/commerce";

export const metadata: Metadata = {
  title: t.admin.quotes,
  robots: { index: false, follow: false },
};

const statusOptions: { value: QuoteStatus; label: string }[] = [
  { value: "NEW", label: "נקלטה" },
  { value: "IN_PROGRESS", label: "בטיפול" },
  { value: "SENT", label: "הצעה נשלחה" },
  { value: "WON", label: "אושרה" },
  { value: "LOST", label: "נסגרה" },
];

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
                <StatusSelect
                  label={`סטטוס בקשה ${quote.number}`}
                  value={quote.status}
                  options={statusOptions}
                  onSave={(next) => setQuoteStatusAction(quote.id, next)}
                />
              </AdminCell>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
