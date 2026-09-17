import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { MatchingDebugger } from './matching-debugger';

export const dynamic = 'force-dynamic';

export default async function AdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/admin/jobs/${id}`)}`);
  if (user.role !== 'admin') redirect('/');

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <MatchingDebugger jobId={id} />
    </main>
  );
}
