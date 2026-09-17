import type { Metadata } from 'next';
import { ConversationList } from '@/features/chat/components/conversation-list';
import { getConversations } from '@/lib/services/jobs/conversations';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'הודעות' };

export default async function CustomerMessagesPage() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  const supabase = await getServerSupabase();

  const conversations =
    supabase && session ? await getConversations(supabase, session.userId, 'customer') : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.nav.messages}</h1>
      <ConversationList
        conversations={conversations}
        basePath="/app/messages"
        emptyTitle={t.empty.noMessages}
      />
    </div>
  );
}
