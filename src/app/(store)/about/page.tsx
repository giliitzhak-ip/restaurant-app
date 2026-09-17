import type { Metadata } from "next";
import Image from "next/image";
import { brand } from "@/config/brand";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { media } from "@/lib/media";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DesignerCta } from "@/features/designer/designer-cta";

export const metadata: Metadata = {
  title: "אודות",
  description: `${brand.name} — שואורום דיגיטלי לפרקטים וחיפויי קירות.`,
  alternates: { canonical: routes.about },
};

export default function AboutPage() {
  return (
    <div className="container-page py-8 md:py-12">
      <Breadcrumbs items={[{ label: "אודות", href: routes.about }]} />

      <div className="mt-6 grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-xl">
          <h1 className="text-display-sm">משטחים, בלי ניחושים</h1>
          <div className="mt-6 space-y-4 text-[0.9375rem] leading-relaxed text-muted">
            <p>
              {brand.name} נולד מתוך תסכול מוכר: לקוחות עומדים בשואורום מול עשרות
              דוגמאות בגודל 10×10 ס״מ, ומנסים לדמיין איך זה ייראה על 60 מ״ר בבית
              שלהם. רובם מחליטים לפי תחושה, וחלקם מתחרטים.
            </p>
            <p>
              לכן בנינו שואורום דיגיטלי שעושה בדיוק את מה שחסר: מצלמים את החדר,
              בוחרים דגם — ורואים אותו בפרספקטיבה ובתאורה של החלל האמיתי. ההדמיה
              משתמשת בטקסטורה של המוצר עצמו, לא בתמונה שנוצרה על ידי AI, כי הדמיה
              שלא מתאימה למה שיגיע לבית היא בדיוק הבעיה שרצינו לפתור.
            </p>
            <p>
              אנחנו עובדים עם יבואנים ויצרנים שמספקים מפרט מלא ומלאי אמיתי, ומציגים
              באתר את אותם נתונים בדיוק — כולל מחיר למ״ר, זמן אספקה וכמות במלאי.
              מה שכתוב הוא מה שיגיע.
            </p>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-line pt-8">
            <div>
              <dt className="text-xs text-muted">דגמים במלאי</dt>
              <dd className="num mt-1 font-display text-2xl">48</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">אספקה</dt>
              <dd className="num mt-1 font-display text-2xl">2–5 ימים</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">אחריות</dt>
              <dd className="num mt-1 font-display text-2xl">עד 25 שנה</dd>
            </div>
          </dl>

          <DesignerCta
            label={t.home.heroPrimaryCta}
            entry="nav"
            size="lg"
            className="mt-10"
          />
        </div>

        <div className="space-y-4">
          <div className="relative aspect-4/5 overflow-hidden rounded-sm bg-surface-2">
            <Image
              src={media.scene("inspiration-nordic")}
              alt="דירה נורדית עם אלון נורדי לבן"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="relative aspect-3/2 overflow-hidden rounded-sm bg-surface-2">
            <Image
              src={media.scene("project-apartment")}
              alt="דירת שלושה חדרים בפלורנטין"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
