import type { Metadata } from 'next';
import { DisputesAdmin } from '@/features/admin/components/simple-tables';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'ניהול' };

export default async function AdminPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.admin.disputes}</h1>
      <DisputesAdmin />
    </div>
  );
}
