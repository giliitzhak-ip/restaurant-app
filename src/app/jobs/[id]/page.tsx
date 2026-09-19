import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { JobLiveView } from './job-live-view';

export const dynamic = 'force-dynamic';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/jobs/${id}`)}`);

  return (
    <main id="main" className="mx-auto min-h-dvh max-w-md px-5 py-8">
      <JobLiveView jobId={id} />
    </main>
  );
}
