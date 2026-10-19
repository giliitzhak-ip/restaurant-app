import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";

export const metadata = { title: "תנאי שימוש ומדיניות הסכמה | SAHAR FACE MOTION AI" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mb-8"><Logo /></div>
      <Card className="space-y-5 leading-relaxed text-pearl/90 sm:p-8">
        <h1 className="text-2xl font-bold text-pearl">תנאי שימוש ומדיניות הסכמה</h1>
        <p className="text-xs text-ash">גרסה 1.0 · טיוטה לצורכי פיתוח. יש לקבל ייעוץ משפטי לפני השקה ציבורית.</p>

        <section className="space-y-2">
          <h2 className="font-bold text-gold">1. הסכמה לשימוש בפנים ובקול</h2>
          <p>מותר להעלות תמונה, סרטון או הקלטת קול של אדם רק אם זה אתם, או שיש בידיכם הסכמה מפורשת ממנו לשימוש הספציפי. לפני כל החלפת פנים, שיבוט קול או סנכרון שפתיים תתבקשו לאשר הצהרת הסכמה, והיא נשמרת במערכת.</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-bold text-gold">2. שיבוט קול</h2>
          <p>שיבוט קול מותר רק לקול שלכם או לקול של אדם שנתן הסכמה מפורשת ומאומתת. אין לשבט קולות של דמויות ציבוריות. מותר ליצור קולות פרודיה מקוריים שאינם מתחזים להקלטה אמיתית.</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-bold text-gold">3. סימון תוכן AI</h2>
          <p>כל קובץ שנוצר או שונה על ידי מודל AI מסומן במערכת כתוכן סינתטי. אסור להציג אותו כהקלטה אותנטית, להטעות באמצעותו, או להשתמש בו להונאה, להטרדה, להשמצה, לתוכן מיני ללא הסכמה או לתוכן שמערב קטינים.</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-bold text-gold">4. פרטיות ומחיקה</h2>
          <p>הקבצים שלכם פרטיים ונגישים רק לכם. ניתן למחוק פרויקט, קבצים או את החשבון כולו בכל עת. קבצים הנשלחים לעיבוד אצל ספק AI חיצוני כפופים גם לתנאי אותו ספק.</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-bold text-gold">5. הגבלות שימוש ועלויות</h2>
          <p>למערכת יש מגבלות על גודל קבצים, משך סרטונים, מספר משימות יומי ותקציב לשירותים בתשלום, כדי למנוע ניצול לרעה וחיובים בלתי צפויים.</p>
        </section>
      </Card>
    </div>
  );
}
