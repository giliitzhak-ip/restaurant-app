import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AvailabilityEditor } from './availability-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'שעות עבודה — GET SERVICE' };

/**
 * The weekly plan, behind the same server-side gate as the console itself.
 *
 * This page was the one provider screen that rendered for anybody: the editor
 * inside it calls APIs that do enforce the role, so nothing leaked, but a
 * signed-out visitor got a working-looking form whose every save failed. The
 * check belongs here, where the alternative is a sign-in rather than an error.
 */
export default async function ProviderAvailabilityPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fprovider%2Favailability');
  if (user.role !== 'provider') {
    redirect(user.role === 'admin' ? '/admin' : '/');
  }

  return (
    <main id="main" className="mx-auto min-h-dvh w-full max-w-md px-4 py-5">
      <AvailabilityEditor />
    </main>
  );
}
