import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { MatchingLab } from './matching-lab';

export const dynamic = 'force-dynamic';

/**
 * /matching-lab (spec §35, §60) — development and admin only.
 *
 * Mandatory because the matching engine is the heart of the product: this is
 * where its behaviour can be checked against intuition before it is trusted
 * with real customers.
 */
export default async function MatchingLabPage() {
  const user = await getCurrentUser();
  const demoMode = process.env.DEMO_MODE === 'true';

  if (!demoMode && user?.role !== 'admin') {
    redirect(user ? '/' : '/login?next=%2Fmatching-lab');
  }

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <MatchingLab />
    </main>
  );
}
