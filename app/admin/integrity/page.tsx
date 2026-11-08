import type { Metadata } from 'next';
import { IntegrityAdmin } from '@/features/admin/components/integrity-admin';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'פיקוח על עבודות' };

export default async function AdminIntegrityPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t.admin.integrity}</h1>
        <p className="text-sm text-muted-foreground">
          העמלה נגבית כשלקוח בוחר בעל מקצוע — לפני שהעבודה בוצעה. המסך הזה מראה מה באמת
          יצא מאותן עבודות: אימות הגעה, אישור לקוח, ולקוחות שחזרו. הנתונים כאן מצביעים על
          מה שכדאי לבדוק, הם אינם הוכחה.
        </p>
      </div>
      <IntegrityAdmin />
    </div>
  );
}
