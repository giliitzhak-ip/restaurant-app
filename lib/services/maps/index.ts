import { env } from '@/lib/env';
import { MockMapsAdapter } from './mock-adapter';
import { GoogleMapsAdapter } from './google-adapter';
import { MapboxAdapter } from './mapbox-adapter';
import type { MapsAdapter } from './types';

let adapter: MapsAdapter | null = null;

/**
 * Picks the maps adapter from configuration. Falls back to the offline mock so
 * geocoding, routing and navigation links all work without an API key.
 */
export function getMapsAdapter(): MapsAdapter {
  if (adapter) return adapter;

  switch (env.mapsProvider) {
    case 'google': {
      const google = new GoogleMapsAdapter(env.mapsServerKey, env.mapsBrowserKey);
      adapter = google.isLive ? google : new MockMapsAdapter();
      break;
    }
    case 'mapbox': {
      const mapbox = new MapboxAdapter(env.mapsServerKey ?? env.mapsBrowserKey);
      adapter = mapbox.isLive ? mapbox : new MockMapsAdapter();
      break;
    }
    default:
      adapter = new MockMapsAdapter();
  }

  return adapter;
}

export function setMapsAdapter(next: MapsAdapter | null) {
  adapter = next;
}

/** Deep link for the "navigate to the customer" button. Works with no key. */
export function navigationLink(lat: number, lng: number, label?: string): string {
  return getMapsAdapter().navigationUrl({ lat, lng }, label);
}

export * from './types';
export { MockMapsAdapter } from './mock-adapter';
