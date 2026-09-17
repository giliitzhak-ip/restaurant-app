import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, JobStatus } from '@/types/database';
import type { Conversation } from '@/features/chat/components/conversation-list';

/**
 * Builds the inbox for one user.
 *
 * A conversation exists once a provider is assigned — that is exactly when the
 * chat RLS policy opens. Reads go through the caller's own client, so the list
 * can only ever contain jobs they are party to.
 */
export async function getConversations(
  supabase: SupabaseClient<Database>,
  userId: string,
  role: 'customer' | 'provider',
  providerId?: string | null,
): Promise<Conversation[]> {
  // A provider without a profile row has no conversations, and comparing a uuid
  // column against an empty string would be a type error rather than no rows.
  if (role === 'provider' && !providerId) return [];

  let query = supabase
    .from('jobs')
    .select(
      `id, title, status, customer_id,
       assigned_provider:provider_profiles (id, business_name, avatar_url),
       customer:users!jobs_customer_id_fkey (id, profiles (full_name, avatar_url))`,
    )
    .not('assigned_provider_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50);

  query =
    role === 'customer'
      ? query.eq('customer_id', userId)
      : query.eq('assigned_provider_id', providerId!);

  const { data: jobs } = await query;
  if (!jobs?.length) return [];

  const jobIds = jobs.map((job) => job.id);

  const { data: messages } = await supabase
    .from('messages')
    .select('job_id, body, message_type, sender_id, read_at, created_at')
    .in('job_id', jobIds)
    .order('created_at', { ascending: false });

  const lastByJob = new Map<string, { body: string; at: string }>();
  const unreadByJob = new Map<string, number>();

  for (const message of messages ?? []) {
    if (!lastByJob.has(message.job_id)) {
      lastByJob.set(message.job_id, {
        body: message.message_type === 'image' ? '📷 תמונה' : (message.body ?? ''),
        at: message.created_at,
      });
    }
    if (message.sender_id !== userId && !message.read_at) {
      unreadByJob.set(message.job_id, (unreadByJob.get(message.job_id) ?? 0) + 1);
    }
  }

  return jobs.map((job) => {
    const provider = job.assigned_provider as
      | { id: string; business_name: string; avatar_url: string | null }
      | null;
    const customer = job.customer as
      | { id: string; profiles: { full_name: string; avatar_url: string | null } | null }
      | null;
    const last = lastByJob.get(job.id);

    return {
      jobId: job.id,
      title: job.title,
      status: job.status as JobStatus,
      counterpartName:
        role === 'customer'
          ? (provider?.business_name ?? 'בעל מקצוע')
          : (customer?.profiles?.full_name ?? 'לקוח'),
      counterpartAvatar:
        role === 'customer' ? (provider?.avatar_url ?? null) : (customer?.profiles?.avatar_url ?? null),
      lastMessage: last?.body ?? null,
      lastAt: last?.at ?? null,
      unread: unreadByJob.get(job.id) ?? 0,
    };
  });
}
