import type { Metadata } from 'next';
import { CategoriesAdmin } from '@/features/admin/components/categories-admin';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'קטגוריות' };

export default async function AdminCategoriesPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.admin.categories}</h1>
      <CategoriesAdmin />
    </div>
  );
}
