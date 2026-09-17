import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { ChatPanel } from '@/features/chat/components/chat-panel';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'שיחה' };

export default async function CustomerChatPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const supabase = await getServerSupabase();
  if (!supabase) notFound();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, assigned_provider:provider_profiles (business_name, avatar_url)')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) notFound();

  const provider = job.assigned_provider as { business_name: string; avatar_url: string | null } | null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/app/messages" aria-label="חזרה לרשימת השיחות" className="rounded-lg p-1">
          <ArrowRight className="size-5" aria-hidden />
        </Link>
        <Avatar src={provider?.avatar_url} name={provider?.business_name ?? 'בעל מקצוע'} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{provider?.business_name ?? 'בעל מקצוע'}</p>
          <Link href={`/app/jobs/${job.id}`} className="truncate text-xs text-accent hover:underline">
            {job.title}
          </Link>
        </div>
        <StatusBadge kind="job" status={job.status} />
      </div>

      <ChatPanel jobId={jobId} currentUserId={session.userId} />
    </div>
  );
}
