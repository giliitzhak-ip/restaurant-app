import { estimateEtaMinutes, haversineKm, type LatLng } from '@/lib/utils/geo';
import type { GeocodeResult, MapsAdapter, RouteEstimate, StaticMapOptions } from './types';

export class MapboxAdapter implements MapsAdapter {
  readonly name = 'mapbox' as const;

  constructor(private readonly token: string | null) {}

  get isLive() {
    return Boolean(this.token);
  }

  async geocode(address: string): Promise<GeocodeResult[]> {
    if (!this.token) return [];
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`,
    );
    url.searchParams.set('access_token', this.token);
    url.searchParams.set('country', 'il');
    url.searchParams.set('language', 'he');
    url.searchParams.set('limit', '5');

    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const json = (await response.json()) as {
      features?: Array<{ place_name: string; center: [number, number]; relevance: number }>;
    };

    return (json.features ?? []).map((feature) => ({
      address: feature.place_name,
      location: { lat: feature.center[1], lng: feature.center[0] },
      city: null,
      postalCode: null,
      confidence: feature.relevance,
    }));
  }

  async reverseGeocode(location: LatLng): Promise<GeocodeResult | null> {
    if (!this.token) return null;
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${location.lng},${location.lat}.json`,
    );
    url.searchParams.set('access_token', this.token);
    url.searchParams.set('language', 'he');

    const response = await fetch(url);
    if (!response.ok) return null;
    const json = (await response.json()) as { features?: Array<{ place_name: string }> };
    const first = json.features?.[0];
    return first
      ? { address: first.place_name, location, city: null, postalCode: null, confidence: 0.8 }
      : null;
  }

  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    const fallback = () => {
      const distanceKm = haversineKm(from, to) * 1.3;
      return { distanceKm, durationMinutes: estimateEtaMinutes(distanceKm), estimated: true };
    };
    if (!this.token) return fallback();

    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
    );
    url.searchParams.set('access_token', this.token);
    url.searchParams.set('overview', 'false');

    const response = await fetch(url);
    if (!response.ok) return fallback();
    const json = (await response.json()) as {
      routes?: Array<{ distance: number; duration: number }>;
    };
    const route = json.routes?.[0];
    if (!route) return fallback();

    return {
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMinutes: Math.round(route.duration / 60),
      estimated: false,
    };
  }

  staticMapUrl(options: StaticMapOptions): string | null {
    if (!this.token) return null;
    const markers = (options.markers ?? [])
      .map((marker) => `pin-s+${(marker.color ?? '0ea5e9').replace('#', '')}(${marker.position.lng},${marker.position.lat})`)
      .join(',');
    const overlay = markers ? `${markers}/` : '';
    const { lat, lng } = options.center;
    return (
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}` +
      `${lng},${lat},${options.zoom ?? 14}/${options.width ?? 640}x${options.height ?? 360}@2x` +
      `?access_token=${this.token}`
    );
  }

  navigationUrl(to: LatLng): string {
    // Hand off to the device's own navigation app rather than building our own.
    return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;
  }
}
