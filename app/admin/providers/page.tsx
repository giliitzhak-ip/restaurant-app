import type { Metadata } from 'next';
import { ProvidersAdmin } from '@/features/admin/components/providers-admin';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'בעלי מקצוע' };

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ t }, params] = await Promise.all([getServerDictionary(), searchParams]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.admin.providers}</h1>
      <ProvidersAdmin initialStatus={params.status ?? ''} />
    </div>
  );
}
