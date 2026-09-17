'use client';

import { useCallback, useState } from 'react';
import type { LatLng } from '@/lib/utils/geo';

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

/**
 * Browser geolocation, requested only when the user presses the button.
 *
 * Nothing is read on mount: the permission prompt has to follow an explicit
 * action, and the caller always has a manual-address path when it is refused.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const request = useCallback(async (): Promise<LatLng | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return null;
    }

    setStatus('requesting');

    return new Promise<LatLng | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          const next = { lat: result.coords.latitude, lng: result.coords.longitude };
          setPosition(next);
          setAccuracy(result.coords.accuracy);
          setStatus('granted');
          resolve(next);
        },
        (error) => {
          setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }, []);

  return { status, position, accuracy, request };
}
