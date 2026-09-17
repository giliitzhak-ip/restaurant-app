import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/states';
import { formatRelative } from '@/lib/utils/format';
import type { JobStatus } from '@/types/database';

export interface Conversation {
  jobId: string;
  title: string;
  status: JobStatus;
  counterpartName: string;
  counterpartAvatar: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
}

export function ConversationList({
  conversations,
  basePath,
  emptyTitle,
}: {
  conversations: Conversation[];
  basePath: string;
  emptyTitle: string;
}) {
  if (conversations.length === 0) {
    return <EmptyState title={emptyTitle} icon={<MessageSquare className="size-6" aria-hidden />} />;
  }

  return (
    <ul className="space-y-2">
      {conversations.map((conversation) => (
        <li key={conversation.jobId}>
          <Link
            href={`${basePath}/${conversation.jobId}`}
            className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-accent/60"
          >
            <Avatar src={conversation.counterpartAvatar} name={conversation.counterpartName} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{conversation.counterpartName}</p>
                {conversation.lastAt ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatRelative(conversation.lastAt)}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {conversation.lastMessage ?? conversation.title}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <StatusBadge kind="job" status={conversation.status} />
              {conversation.unread > 0 ? (
                <span className="num rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                  {conversation.unread}
                </span>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
