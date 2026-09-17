'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { ImagePlus, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useApi } from '@/hooks/use-api';
import { useRealtime } from '@/hooks/use-realtime';
import { useT } from '@/components/providers/i18n-provider';
import { formatRelative } from '@/lib/utils/format';
import { signedUrlFor, uploadFile } from '@/lib/upload-client';

interface Message {
  id: string;
  job_id: string;
  sender_id: string;
  body: string | null;
  message_type: 'text' | 'image' | 'system';
  storage_path: string | null;
  created_at: string;
}

/**
 * Job chat.
 *
 * Messages are persisted in `messages` and delivered over Realtime; RLS makes
 * the channel private to the job's two parties. Images go to the private
 * `chat-media` bucket and are shown through short-lived signed URLs.
 */
export function ChatPanel({ jobId, currentUserId }: { jobId: string; currentUserId: string }) {
  const t = useT();
  const { data, loading, error, reload } = useApi<{ messages: Message[] }>(
    `/api/jobs/${jobId}/messages`,
  );

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const messages = useMemo(() => data?.messages ?? [], [data]);

  useRealtime<Record<string, unknown>>({
    table: 'messages',
    filter: `job_id=eq.${jobId}`,
    event: 'INSERT',
    onChange: reload,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Resolve signed URLs for any image message we have not resolved yet.
  useEffect(() => {
    const pending = messages.filter(
      (message) => message.message_type === 'image' && message.storage_path && !imageUrls[message.id],
    );
    if (!pending.length) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        pending.map(async (message) => {
          const url = await signedUrlFor('chat-media', message.storage_path!);
          return [message.id, url] as const;
        }),
      );
      if (cancelled) return;
      setImageUrls((current) => ({
        ...current,
        ...Object.fromEntries(entries.filter(([, url]) => url) as Array<[string, string]>),
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, imageUrls]);

  const send = useCallback(
    async (payload: { body?: string; storagePath?: string; messageType: 'text' | 'image' }) => {
      setSending(true);
      setSendError(null);
      try {
        const response = await fetch(`/api/jobs/${jobId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as { ok: boolean; error?: { message: string } };
        if (!result.ok) {
          setSendError(result.error?.message ?? t.errors.generic);
          return false;
        }
        await reload();
        return true;
      } catch {
        setSendError(t.errors.network);
        return false;
      } finally {
        setSending(false);
      }
    },
    [jobId, reload, t.errors.generic, t.errors.network],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const ok = await send({ body, messageType: 'text' });
    if (ok) setDraft('');
  }

  async function handleImage(file: File | undefined) {
    if (!file) return;
    setSendError(null);
    try {
      const uploaded = await uploadFile('chat-media', file);
      await send({ storagePath: uploaded.path, messageType: 'image' });
    } catch (uploadError) {
      setSendError(uploadError instanceof Error ? uploadError.message : t.errors.generic);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] flex-col rounded-xl border bg-card md:h-[32rem]">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <ErrorState description={error} onRetry={reload} />
        ) : messages.length === 0 ? (
          <EmptyState title={t.empty.noMessages} />
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => {
              const mine = message.sender_id === currentUserId;
              return (
                <li key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                      message.message_type === 'system'
                        ? 'mx-auto bg-secondary text-center text-xs text-muted-foreground'
                        : mine
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-secondary',
                    )}
                  >
                    {message.message_type === 'image' ? (
                      imageUrls[message.id] ? (
                        <Image
                          src={imageUrls[message.id]}
                          alt="תמונה בשיחה"
                          width={320}
                          height={240}
                          unoptimized
                          className="rounded-lg"
                        />
                      ) : (
                        <span className="skeleton block h-32 w-48 rounded-lg" />
                      )
                    ) : (
                      <p className="whitespace-pre-line break-words">{message.body}</p>
                    )}
                    <time
                      dateTime={message.created_at}
                      className={cn(
                        'mt-1 block text-[10px]',
                        mine ? 'text-accent-foreground/70' : 'text-muted-foreground',
                      )}
                    >
                      {formatRelative(message.created_at)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {sendError ? (
        <p role="alert" className="border-t bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive">
          {sendError}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          id={`chat-image-${jobId}`}
          onChange={(event) => handleImage(event.target.files?.[0])}
        />
        <Button asChild variant="ghost" size="icon" type="button">
          <label htmlFor={`chat-image-${jobId}`} className="cursor-pointer">
            <ImagePlus aria-hidden />
            <span className="sr-only">{t.chat.sendImage}</span>
          </label>
        </Button>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t.chat.placeholder}
          aria-label={t.chat.placeholder}
          maxLength={2000}
        />
        <Button type="submit" size="icon" loading={sending} disabled={!draft.trim()}>
          <Send aria-hidden />
          <span className="sr-only">{t.common.send}</span>
        </Button>
      </form>
    </div>
  );
}
