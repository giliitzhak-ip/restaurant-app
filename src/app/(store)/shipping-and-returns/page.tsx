import type { Metadata } from "next";
import { commerce } from "@/config/brand";
import { routes } from "@/config/site";
import { formatPrice } from "@/lib/format";
import { LegalPage } from "@/features/legal/legal-page";

export const metadata: Metadata = {
  title: "משלוחים והחזרות",
  description: "זמני אספקה, עלויות משלוח, איסוף עצמי ומדיניות החזרות.",
  alternates: { canonical: routes.shipping },
};

export default function ShippingPage() {
  return (
    <LegalPage
      title="משלוחים והחזרות"
      href={routes.shipping}
      document="shipping"
      intro="הכל על אספקה, איסוף והחזרות — במקום אחד, בלי אותיות קטנות."
      sections={[
        {
          heading: "זמני אספקה",
          paragraphs: [
            "דגמים במלאי יוצאים תוך 2–5 ימי עסקים. בכל עמוד מוצר מופיע זמן האספקה בפועל וכמות המלאי המעודכנת.",
            "דגמים בהזמנה מיוחדת: 10–21 ימי עסקים. נציג מאשר איתכם את התאריך לפני חיוב.",
          ],
        },
        {
          heading: "עלויות",
          paragraphs: [
            `משלוח עד הבית: ${formatPrice(commerce.shippingFlatRate)} · חינם בקנייה מעל ${formatPrice(commerce.freeShippingThreshold)}.`,
            "איסוף עצמי מהשואורום: ללא עלות, מוכן בתוך 24 שעות.",
            `הזמנת דוגמה פיזית: ${formatPrice(commerce.samplePrice)} — מוחזר במלואו בהזמנה.`,
          ],
        },
        {
          heading: "מה כלול באספקה",
          paragraphs: [
            "המשלוח מגיע עד הכניסה לבניין. חומר לרצפה מגיע במשטחים, ולכן חשוב לוודא גישה לרכב הובלה.",
            "העלאה לקומות ופינוי אריזות כלולים רק בהזמנת שירות התקנה.",
          ],
        },
        {
          heading: "בדיקה בקבלה",
          paragraphs: [
            "מומלץ לבדוק את הכמות ואת מספר מנת הייצור מול תעודת המשלוח, ולפתוח רק את החבילות שמותקנות בפועל — חבילות סגורות ניתן להחזיר.",
          ],
        },
        {
          heading: "החזרות",
          paragraphs: [
            "עד 14 יום מקבלת ההזמנה, על חבילות שלמות וסגורות באריזה המקורית, בהתאם לחוק הגנת הצרכן.",
            "חומר שנחתך, חבילות שנפתחו והזמנות מיוחדות אינם ניתנים להחזרה.",
          ],
        },
        {
          heading: "התקנה",
          paragraphs: [
            `שירות התקנה אופציונלי, ${commerce.installationPricePerSqm ? formatPrice(commerce.installationPricePerSqm) : ""} למ״ר כאומדן, סופי לאחר מדידה. כולל אחריות על העבודה.`,
          ],
        },
      ]}
    />
  );
}
