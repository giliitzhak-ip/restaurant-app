import type { Metadata } from 'next';
import { ProviderSearch } from '@/features/customer/components/provider-search';
import { getCategories } from '@/lib/services/catalogue';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'חיפוש בעלי מקצוע' };

export default async function SearchPage() {
  const [{ t }, categories] = await Promise.all([getServerDictionary(), getCategories()]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.search.title}</h1>
      <ProviderSearch categories={categories} />
    </div>
  );
}
