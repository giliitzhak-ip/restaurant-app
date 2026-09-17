'use client';

import { useCallback, useState } from 'react';

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout';

export interface GeoFix {
  readonly lat: number;
  readonly lon: number;
  readonly accuracyM: number | null;
  readonly headingDeg: number | null;
  readonly speedKmh: number | null;
  readonly at: number;
}

export interface GeoState {
  readonly status: GeoStatus;
  readonly fix: GeoFix | null;
  readonly message: string | null;
}

const MESSAGES: Record<Exclude<GeoStatus, 'idle' | 'requesting' | 'granted'>, string> = {
  denied: 'לא אישרתם גישה למיקום. אפשר להזין כתובת במקום.',
  unavailable: 'המיקום אינו זמין במכשיר הזה. אפשר להזין כתובת במקום.',
  timeout: 'לא הצלחנו לאתר את המיקום. נסו שוב או הזינו כתובת.',
};

/**
 * Browser geolocation with explicit failure states (spec §44).
 *
 * There is NO fallback coordinate. If the device cannot give us a position we
 * say so and ask for an address: a guessed location would send a professional
 * to the wrong street, which is worse than an honest failure.
 */
export function useGeolocation(): GeoState & { request: () => Promise<GeoFix | null> } {
  const [state, setState] = useState<GeoState>({ status: 'idle', fix: null, message: null });

  const request = useCallback(async (): Promise<GeoFix | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'unavailable', fix: null, message: MESSAGES.unavailable });
      return null;
    }

    setState({ status: 'requesting', fix: null, message: null });

    return new Promise<GeoFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy, heading, speed } = position.coords;
          const fix: GeoFix = {
            lat: latitude,
            lon: longitude,
            accuracyM: Number.isFinite(accuracy) ? accuracy : null,
            // heading and speed are null on most stationary devices; we pass
            // that through rather than substituting zero, which would look
            // like "pointing due north at a standstill".
            headingDeg: heading !== null && Number.isFinite(heading) ? heading : null,
            speedKmh: speed !== null && Number.isFinite(speed) ? speed * 3.6 : null,
            at: Date.now(),
          };
          setState({ status: 'granted', fix, message: null });
          resolve(fix);
        },
        (error) => {
          const status: GeoStatus =
            error.code === error.PERMISSION_DENIED
              ? 'denied'
              : error.code === error.TIMEOUT
                ? 'timeout'
                : 'unavailable';
          setState({
            status,
            fix: null,
            message: MESSAGES[status as keyof typeof MESSAGES] ?? MESSAGES.unavailable,
          });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    });
  }, []);

  return { ...state, request };
}
