import type { Metadata } from 'next';
import { SettingsAdmin } from '@/features/admin/components/settings-admin';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'הגדרות' };

export default async function AdminSettingsPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.admin.settings}</h1>
      <SettingsAdmin />
    </div>
  );
}
