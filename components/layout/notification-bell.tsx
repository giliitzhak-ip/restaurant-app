'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { useApi } from '@/hooks/use-api';
import { useRealtime } from '@/hooks/use-realtime';
import { formatRelative } from '@/lib/utils/format';
import { useT } from '@/components/providers/i18n-provider';

interface NotificationItem {
  id: string;
  event: string;
  title: string;
  body: string;
  job_id: string | null;
  read_at: string | null;
  created_at: string;
}

/** Notification centre. Updates over Realtime rather than polling. */
export function NotificationBell({ userId }: { userId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useApi<{ notifications: NotificationItem[] }>(
    '/api/notifications?limit=30',
  );

  useRealtime<Record<string, unknown>>({
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
    event: 'INSERT',
    onChange: reload,
  });

  const notifications = data?.notifications ?? [];
  const unread = notifications.filter((item) => !item.read_at).length;

  const markAllRead = useCallback(async () => {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    void reload();
  }, [reload]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`${t.notifications.title}${unread ? `, ${unread} חדשות` : ''}`}
        className="relative"
      >
        <Bell aria-hidden />
        {unread > 0 ? (
          <span className="num absolute end-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t.notifications.title}
        footer={
          unread > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead} className="w-full">
              {t.notifications.markAllRead}
            </Button>
          ) : undefined
        }
      >
        {loading ? (
          <LoadingState />
        ) : notifications.length === 0 ? (
          <EmptyState title={t.empty.noNotifications} icon={<Bell className="size-6" aria-hidden />} />
        ) : (
          <ul className="space-y-2">
            {notifications.map((item) => {
              const content = (
                <div
                  className={`rounded-lg border p-3 ${item.read_at ? '' : 'border-accent/40 bg-accent/5'}`}
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatRelative(item.created_at)}
                  </p>
                </div>
              );

              return (
                <li key={item.id}>
                  {item.job_id ? (
                    <Link href={`/app/jobs/${item.job_id}`} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}
