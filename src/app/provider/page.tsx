import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ProviderConsole } from './provider-console';

export const dynamic = 'force-dynamic';

export default async function ProviderPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fprovider');
  if (user.role !== 'provider') {
    redirect(user.role === 'admin' ? '/admin' : '/');
  }

  return (
    <main id="main" className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <ProviderConsole />
    </main>
  );
}
