'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/providers/i18n-provider';

export function FavoriteButton({
  providerId,
  initiallySaved,
  className,
}: {
  providerId: string;
  initiallySaved: boolean;
  className?: string;
}) {
  const t = useT();
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    // Optimistic: flip immediately, revert if the request fails.
    const next = !saved;
    setSaved(next);

    try {
      const response = next
        ? await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId }),
          })
        : await fetch(`/api/favorites?providerId=${providerId}`, { method: 'DELETE' });

      if (!response.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant={saved ? 'secondary' : 'outline'}
      size="sm"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      className={className}
    >
      <Heart className={cn(saved && 'fill-destructive text-destructive')} aria-hidden />
      {saved ? t.favorites.remove : t.favorites.add}
    </Button>
  );
}
