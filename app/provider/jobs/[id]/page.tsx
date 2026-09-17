import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ProviderJobDetail } from '@/features/provider/components/provider-job-detail';
import { getSessionContext } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'פרטי עבודה' };

export default async function ProviderJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session?.providerId) redirect('/provider');

  return <ProviderJobDetail jobId={id} providerId={session.providerId} />;
}
