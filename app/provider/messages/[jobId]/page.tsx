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

export default async function ProviderChatPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const supabase = await getServerSupabase();
  if (!supabase) notFound();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, customer:users!jobs_customer_id_fkey (profiles (full_name, avatar_url))')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) notFound();

  const customer = job.customer as { profiles: { full_name: string; avatar_url: string | null } | null } | null;
  const name = customer?.profiles?.full_name ?? 'לקוח';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/provider/messages" aria-label="חזרה לרשימת השיחות" className="rounded-lg p-1">
          <ArrowRight className="size-5" aria-hidden />
        </Link>
        <Avatar src={customer?.profiles?.avatar_url} name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <Link href={`/provider/jobs/${job.id}`} className="truncate text-xs text-accent hover:underline">
            {job.title}
          </Link>
        </div>
        <StatusBadge kind="job" status={job.status} />
      </div>

      <ChatPanel jobId={jobId} currentUserId={session.userId} />
    </div>
  );
}
