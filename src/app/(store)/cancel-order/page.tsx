import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { routes, legalNav } from "@/config/site";
import { DRAFT_NOTICE, legalFacts, LEGAL_PLACEHOLDER } from "@/config/legal";
import { CancellationForm } from "@/features/legal/cancellation-form";

export const metadata: Metadata = {
  title: "ביטול עסקה",
  description:
    "טופס מקוון לביטול עסקה או החזרת מוצר, יחד עם הדרכים הנוספות למסור הודעת ביטול.",
  alternates: { canonical: routes.cancelOrder },
};

const fact = (key: keyof typeof legalFacts) => legalFacts[key].value ?? LEGAL_PLACEHOLDER;

export default function CancelOrderPage() {
  return (
    <div className="container-page max-w-3xl py-8 md:py-12">
      <Breadcrumbs items={[{ label: "ביטול עסקה", href: routes.cancelOrder }]} />
      <h1 className="mt-6 text-display-sm">ביטול עסקה</h1>
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
        אפשר למסור הודעת ביטול בטופס שבהמשך הדף, ואפשר גם בטלפון, בדוא״ל או בדואר רשום —
        כל הדרכים שקולות, ואף אחת מהן אינה תנאי לאחרת. אנחנו רושמים את מועד קבלת ההודעה.
      </p>

      <div
        role="note"
        className="mt-5 rounded-sm border border-warning/40 bg-warning/10 p-3.5 text-[0.8125rem] leading-relaxed text-ink-soft"
      >
        {DRAFT_NOTICE}
      </div>

      <section className="mt-8 rounded-md border border-line bg-surface-2 p-5">
        <h2 className="text-lg">דרכים נוספות למסור הודעת ביטול</h2>
        <dl className="mt-3 space-y-2 text-[0.9375rem] leading-relaxed">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">טלפון:</dt>
            <dd className="num text-muted">{fact("phone")}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">דואר אלקטרוני:</dt>
            <dd className="text-muted">{fact("supportEmail")}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">כתובת למשלוח הודעת ביטול:</dt>
            <dd className="text-muted">{fact("returnsAddress")}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium">שעות מענה:</dt>
            <dd className="text-muted">{fact("supportHours")}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-lg">מה קורה אחרי השליחה</h2>
        <ul className="mt-3 space-y-1.5 ps-5 text-[0.9375rem] leading-relaxed text-muted">
          <li className="list-disc">תקבלו מספר פנייה על המסך. שמרו אותו.</li>
          <li className="list-disc">
            הבקשה נרשמת אצלנו יחד עם מועד קבלתה, ונציג בוחן אותה.
          </li>
          <li className="list-disc">
            ההזמנה אינה מבוטלת ואינה נמחקת אוטומטית עם שליחת הטופס — הביטול בפועל, והחזר
            כספי אם מגיע, מתבצעים לאחר הבדיקה.
          </li>
          <li className="list-disc">
            אם לדעתנו חלה על פריט מסוים חריגה כלשהי, נסביר לכם מה הבסיס לכך בתשובה. אנחנו
            לא קובעים זאת אוטומטית לפי סוג המוצר.
          </li>
        </ul>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          זכויות הביטול, המועדים, דמי הביטול האפשריים והחריגים — לרבות לגבי מוצר שיוצר או
          נחתך במיוחד עבורכם — מפורטים ב
          <Link href={routes.shipping} className="link-quiet underline">
            משלוחים, החזרות וביטולים
          </Link>
          . אין באמור באתר כדי לגרוע מזכויות המוקנות לכם לפי חוק הגנת הצרכן ולפי כל דין.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl">טופס ביטול מקוון</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          שדות המסומנים כחובה נדרשים כדי שנוכל לזהות את ההזמנה. סיבת הביטול אינה חובה.
        </p>
        <div className="mt-5">
          <CancellationForm />
        </div>
      </section>

      <nav aria-label="מסמכים משפטיים" className="mt-14 border-t border-line pt-6">
        <h2 className="text-xs font-semibold tracking-wide text-muted">המסמכים שלנו</h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {legalNav
            .filter((item) => item.href !== routes.cancelOrder)
            .map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="link-quiet text-[0.8125rem]">
                  {item.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}
