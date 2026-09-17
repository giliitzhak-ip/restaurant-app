import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { RequestFlow } from './request-flow';

export const dynamic = 'force-dynamic';

/**
 * Turn a description into a dispatched job (spec §8).
 *
 * Only two things stand between the customer and a matched professional:
 * confirming what we understood, and a location. Everything else is
 * inferred server-side.
 */
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string; category?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    const next = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/login?next=${encodeURIComponent(`/request?${next}`)}`);
  }

  const mode =
    params.mode === 'SCHEDULE' || params.mode === 'COMPARE' ? params.mode : 'NOW';

  return (
    <main id="main" className="mx-auto min-h-screen max-w-md px-5 py-8">
      <RequestFlow
        initialDescription={params.q ?? ''}
        bookingMode={mode}
        categoryHint={params.category ?? null}
        // Scoped exemption: this is a SERVER component rendered once per
        // request, so a per-request clock read is deterministic for that
        // render and cannot cause a hydration mismatch. The value is only a
        // UX floor on the picker — the chosen time is revalidated server-side
        // in POST /api/jobs, which is the actual guard.
        // eslint-disable-next-line react-hooks/purity
        minScheduleValue={new Date(Date.now() + 3_600_000).toISOString().slice(0, 16)}
      />
    </main>
  );
}
