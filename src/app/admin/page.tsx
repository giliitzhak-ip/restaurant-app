import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AdminTower } from './admin-tower';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fadmin');
  if (user.role !== 'admin') redirect(user.role === 'provider' ? '/provider' : '/');

  return (
    // Admin is desktop-first, responsive down (spec §42).
    <main id="main" className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <AdminTower />
    </main>
  );
}
