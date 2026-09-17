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
        // Deriving this from Date.now() during a client render would be
        // impure and would disagree between server and client. This is a
        // server component rendered once per request, so the read is
        // deterministic for that render; the value is only a floor on the
        // picker, and POST /api/jobs revalidates the chosen time.
        // eslint-disable-next-line react-hooks/purity
        minScheduleValue={new Date(Date.now() + 3_600_000).toISOString().slice(0, 16)}
      />
    </main>
  );
}
