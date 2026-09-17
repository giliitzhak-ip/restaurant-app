'use client';

import { useState } from 'react';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useT } from '@/components/providers/i18n-provider';
import type { LatLng } from '@/lib/utils/geo';

export interface LocationValue {
  address: string;
  addressNotes: string;
  coords: LatLng | null;
}

interface Props {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  error?: string;
}

interface GeocodeResult {
  address: string;
  location: LatLng;
  confidence: number;
}

/**
 * Location step.
 *
 * Geolocation is requested only when the user presses the button, and refusing
 * it is a first-class path: typing an address geocodes server-side instead.
 */
export function LocationStep({ value, onChange, error }: Props) {
  const t = useT();
  const geo = useGeolocation();
  const [lookingUp, setLookingUp] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  async function useMyLocation() {
    setLookupError(null);
    const coords = await geo.request();
    if (!coords) return;

    setLookingUp(true);
    try {
      const response = await fetch(`/api/geo/geocode?lat=${coords.lat}&lng=${coords.lng}`);
      const payload = (await response.json()) as
        | { ok: true; data: { results: GeocodeResult[] } }
        | { ok: false };
      const address = payload.ok ? payload.data.results[0]?.address : null;
      onChange({ ...value, coords, address: address ?? value.address });
    } finally {
      setLookingUp(false);
    }
  }

  async function lookupAddress() {
    const query = value.address.trim();
    if (query.length < 3) return;

    setLookingUp(true);
    setLookupError(null);
    setResults([]);

    try {
      const response = await fetch(`/api/geo/geocode?address=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as
        | { ok: true; data: { results: GeocodeResult[] } }
        | { ok: false; error: { message: string } };

      if (!payload.ok) {
        setLookupError(payload.error.message);
        return;
      }
      if (!payload.data.results.length) {
        setLookupError('לא מצאנו את הכתובת. נסה לנסח אחרת.');
        return;
      }

      if (payload.data.results.length === 1) {
        const [only] = payload.data.results;
        onChange({ ...value, address: only.address, coords: only.location });
      } else {
        setResults(payload.data.results);
      }
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" size="full" onClick={useMyLocation} loading={lookingUp}>
        <Navigation aria-hidden />
        {t.wizard.useGps}
      </Button>

      {geo.status === 'denied' ? (
        <p role="status" className="rounded-lg bg-warning/10 p-3 text-sm">
          {t.wizard.gpsDenied}
        </p>
      ) : null}

      <Field label={t.wizard.addressLabel} htmlFor="address" error={error} required>
        <div className="flex gap-2">
          <Input
            id="address"
            value={value.address}
            onChange={(event) => onChange({ ...value, address: event.target.value, coords: null })}
            onBlur={() => {
              if (!value.coords) void lookupAddress();
            }}
            placeholder={t.wizard.addressPlaceholder}
            aria-invalid={Boolean(error)}
            autoComplete="street-address"
          />
          <Button type="button" variant="secondary" onClick={lookupAddress} disabled={lookingUp}>
            {lookingUp ? <Loader2 className="animate-spin" aria-hidden /> : <MapPin aria-hidden />}
            <span className="sr-only">איתור כתובת</span>
          </Button>
        </div>
      </Field>

      {lookupError ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {lookupError}
        </p>
      ) : null}

      {results.length > 1 ? (
        <ul className="space-y-1.5" aria-label="תוצאות כתובת">
          {results.map((result) => (
            <li key={`${result.address}-${result.location.lat}`}>
              <button
                type="button"
                onClick={() => {
                  onChange({ ...value, address: result.address, coords: result.location });
                  setResults([]);
                }}
                className="w-full rounded-lg border p-3 text-start text-sm hover:border-accent/60"
              >
                {result.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {value.coords ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-success/10 p-3 text-sm text-success">
          <MapPin className="size-4" aria-hidden />
          המיקום אותר
          <span className="num text-xs opacity-70">
            ({value.coords.lat.toFixed(4)}, {value.coords.lng.toFixed(4)})
          </span>
        </p>
      ) : null}

      <Field label={t.wizard.addressNotes} htmlFor="addressNotes" hint={t.common.optional}>
        <Input
          id="addressNotes"
          value={value.addressNotes}
          onChange={(event) => onChange({ ...value, addressNotes: event.target.value })}
          placeholder={t.wizard.addressNotesPlaceholder}
        />
      </Field>
    </div>
  );
}
