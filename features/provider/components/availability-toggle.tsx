'use client';

import { useEffect, useRef, useState } from 'react';
import { Power, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/components/providers/i18n-provider';
import { patchJson } from '@/features/auth/lib/form';

interface Props {
  initiallyAvailable: boolean;
  canGoOnline: boolean;
}

/**
 * The "אני זמין" switch.
 *
 * While available the browser reports the provider's position so that matching
 * and the customer's live map have something real to show. Turning the switch
 * off stops the watcher and clears the stored location — position is kept only
 * while it is operationally needed.
 */
export function AvailabilityToggle({ initiallyAvailable, canGoOnline }: Props) {
  const t = useT();
  const [available, setAvailable] = useState(initiallyAvailable);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!available || typeof navigator === 'undefined' || !navigator.geolocation) return;

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        void fetch('/api/provider/location', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy,
            ...(position.coords.heading !== null ? { heading: position.coords.heading } : {}),
          }),
        });
      },
      () => {
        // Position is a bonus, not a requirement: service areas still apply.
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [available]);

  async function toggle() {
    if (!canGoOnline && !available) {
      setError(t.provider.pendingVerification);
      return;
    }

    setPending(true);
    setError(null);
    const next = !available;

    try {
      await patchJson('/api/provider/availability', { isAvailable: next });
      setAvailable(next);
      if (!next) await fetch('/api/provider/location', { method: 'DELETE' });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : t.errors.generic);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        'rounded-2xl border p-5 transition-colors',
        available ? 'border-success/40 bg-success/5' : 'bg-card',
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{available ? t.provider.availableOn : t.provider.availableOff}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.provider.availableHint}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={available}
          aria-label={t.provider.availableToggle}
          onClick={toggle}
          disabled={pending}
          className={cn(
            'relative flex h-12 w-20 shrink-0 items-center rounded-full border-2 transition-colors',
            available ? 'border-success bg-success' : 'border-input bg-secondary',
            pending && 'opacity-60',
          )}
        >
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-full bg-background shadow transition-transform',
              available ? 'translate-x-[-1.75rem] rtl:translate-x-[1.75rem]' : 'translate-x-0.5',
            )}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Power className={cn('size-4', available ? 'text-success' : 'text-muted-foreground')} aria-hidden />
            )}
          </span>
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
