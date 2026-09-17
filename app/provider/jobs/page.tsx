import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ProviderJobsTabs } from '@/features/provider/components/provider-jobs-tabs';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'עבודות' };

export default async function ProviderJobsPage() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  if (!session?.providerId) redirect('/provider');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.nav.jobs}</h1>
      <ProviderJobsTabs
        providerId={session.providerId}
        verified={session.providerStatus === 'verified'}
      />
    </div>
  );
}
