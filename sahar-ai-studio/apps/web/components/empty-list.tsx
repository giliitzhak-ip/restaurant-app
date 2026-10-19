import { Inbox } from 'lucide-react';

export function EmptyList({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground"
      data-testid="empty-list"
    >
      <Inbox className="size-6 opacity-60" aria-hidden />
      {label}
    </div>
  );
}
