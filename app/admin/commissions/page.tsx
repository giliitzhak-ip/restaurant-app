import type { Metadata } from 'next';
import { CommissionsAdmin } from '@/features/admin/components/simple-tables';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'עמלות' };

export default async function AdminCommissionsPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t.admin.commissions}</h1>
        <p className="text-sm text-muted-foreground">
          כל הכסף של GET SERVICE עובר כאן: עמלות שנגבו מיתרת בעלי מקצוע, החזרים וטעינות.
          התשלום על העבודה עצמה עובר ישירות מהלקוח לבעל המקצוע ואינו מופיע כאן.
        </p>
      </div>
      <CommissionsAdmin />
    </div>
  );
}
