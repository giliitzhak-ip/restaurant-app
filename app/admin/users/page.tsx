import type { Metadata } from 'next';
import { UsersAdmin } from '@/features/admin/components/users-admin';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'משתמשים' };

export default async function AdminUsersPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.admin.users}</h1>
      <UsersAdmin />
    </div>
  );
}
