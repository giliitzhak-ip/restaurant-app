import type { LatLng } from '@/lib/utils/geo';

export interface GeocodeResult {
  address: string;
  location: LatLng;
  city?: string | null;
  postalCode?: string | null;
  /** 0–1; how confident the provider is in the match. */
  confidence: number;
}

export interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number;
  /** True when the number came from a heuristic rather than a routing API. */
  estimated: boolean;
}

export interface StaticMapOptions {
  center: LatLng;
  zoom?: number;
  width?: number;
  height?: number;
  markers?: Array<{ position: LatLng; label?: string; color?: string }>;
}

/**
 * The application never imports a maps SDK directly — it talks to this.
 * Swapping Google for Mapbox is a new adapter plus NEXT_PUBLIC_MAPS_PROVIDER.
 */
export interface MapsAdapter {
  readonly name: 'google' | 'mapbox' | 'mock';
  readonly isLive: boolean;

  geocode(address: string): Promise<GeocodeResult[]>;
  reverseGeocode(location: LatLng): Promise<GeocodeResult | null>;
  route(from: LatLng, to: LatLng): Promise<RouteEstimate>;
  /** URL of a static map image, or null when the adapter cannot render one. */
  staticMapUrl(options: StaticMapOptions): string | null;
  /** Deep link that opens turn-by-turn navigation in the device's map app. */
  navigationUrl(to: LatLng, label?: string): string;
}
