import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { RequestFlow } from './request-flow';

export const dynamic = 'force-dynamic';

/**
 * Turn a description into a dispatched job (spec §8).
 *
 * The home screen already asked WHAT and WHEN, and both travel here in the
 * URL so a reload or a sign-in detour does not lose them. Only one thing is
 * left to establish — WHERE — plus a chance to correct what we understood.
 */
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; timing?: string; at?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    // Every parameter is preserved across the sign-in, so the request the
    // customer started is the request they come back to (spec §47).
    const next = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ).toString();
    redirect(`/login?next=${encodeURIComponent(`/request?${next}`)}`);
  }

  /*
   * Only a customer can open a job.
   *
   * A provider arriving here got the whole flow — classification, location,
   * the confirm button — and then a refusal from POST /api/jobs, which is
   * the worst possible order to discover it in. An admin has a control tower
   * and no reason to be here at all.
   */
  if (user.role !== 'customer') {
    redirect(user.role === 'provider' ? '/provider' : '/admin');
  }

  // `mode` is still accepted so links from before the timing model keep
  // working; SCHEDULE meant "a specific time", which is SCHEDULED now.
  const timing =
    params.timing === 'ASAP' || params.timing === 'SCHEDULED'
      ? params.timing
      : params.mode === 'SCHEDULE'
        ? 'SCHEDULED'
        : 'NOW';

  return (
    <main id="main" className="mx-auto min-h-dvh max-w-md px-5 py-7">
      <RequestFlow
        initialDescription={params.q ?? ''}
        initialTiming={timing}
        initialRequestedFor={params.at ?? ''}
      />
    </main>
  );
}
