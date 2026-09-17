import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ProviderOnboarding } from './provider-onboarding';

export const dynamic = 'force-dynamic';

/**
 * Provider onboarding (spec §31).
 *
 * Without this, registering as a provider produces an account that can never
 * be matched: the candidate query INNER JOINs provider_categories, so a
 * provider with no declared trade is not a low-ranked candidate — they are
 * absent entirely.
 */
export default async function ProviderOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fprovider%2Fonboarding');
  if (user.role !== 'provider') {
    redirect(user.role === 'admin' ? '/admin' : '/');
  }

  return (
    <main id="main" className="mx-auto min-h-screen max-w-md px-5 py-8">
      <ProviderOnboarding />
    </main>
  );
}
