import { estimateEtaMinutes, haversineKm, type LatLng } from '@/lib/utils/geo';
import type { GeocodeResult, MapsAdapter, RouteEstimate, StaticMapOptions } from './types';

export class GoogleMapsAdapter implements MapsAdapter {
  readonly name = 'google' as const;

  constructor(
    private readonly serverKey: string | null,
    private readonly browserKey: string | null,
  ) {}

  get isLive() {
    return Boolean(this.serverKey);
  }

  async geocode(address: string): Promise<GeocodeResult[]> {
    if (!this.serverKey) return [];
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', this.serverKey);
    url.searchParams.set('language', 'iw');
    url.searchParams.set('region', 'il');

    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const json = (await response.json()) as {
      results?: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number }; location_type?: string };
        address_components?: Array<{ long_name: string; types: string[] }>;
      }>;
    };

    return (json.results ?? []).map((result) => ({
      address: result.formatted_address,
      location: result.geometry.location,
      city:
        result.address_components?.find((component) => component.types.includes('locality'))
          ?.long_name ?? null,
      postalCode:
        result.address_components?.find((component) => component.types.includes('postal_code'))
          ?.long_name ?? null,
      confidence: result.geometry.location_type === 'ROOFTOP' ? 1 : 0.6,
    }));
  }

  async reverseGeocode(location: LatLng): Promise<GeocodeResult | null> {
    if (!this.serverKey) return null;
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${location.lat},${location.lng}`);
    url.searchParams.set('key', this.serverKey);
    url.searchParams.set('language', 'iw');

    const response = await fetch(url);
    if (!response.ok) return null;
    const json = (await response.json()) as {
      results?: Array<{ formatted_address: string }>;
    };
    const first = json.results?.[0];
    return first
      ? { address: first.formatted_address, location, city: null, postalCode: null, confidence: 0.8 }
      : null;
  }

  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    if (!this.serverKey) {
      const distanceKm = haversineKm(from, to) * 1.3;
      return { distanceKm, durationMinutes: estimateEtaMinutes(distanceKm), estimated: true };
    }

    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${from.lat},${from.lng}`);
    url.searchParams.set('destinations', `${to.lat},${to.lng}`);
    url.searchParams.set('key', this.serverKey);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('departure_time', 'now');

    const response = await fetch(url);
    if (!response.ok) {
      const distanceKm = haversineKm(from, to) * 1.3;
      return { distanceKm, durationMinutes: estimateEtaMinutes(distanceKm), estimated: true };
    }

    const json = (await response.json()) as {
      rows?: Array<{
        elements?: Array<{
          status: string;
          distance?: { value: number };
          duration_in_traffic?: { value: number };
          duration?: { value: number };
        }>;
      }>;
    };
    const element = json.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      const distanceKm = haversineKm(from, to) * 1.3;
      return { distanceKm, durationMinutes: estimateEtaMinutes(distanceKm), estimated: true };
    }

    return {
      distanceKm: Math.round(((element.distance?.value ?? 0) / 1000) * 100) / 100,
      durationMinutes: Math.round(
        (element.duration_in_traffic?.value ?? element.duration?.value ?? 0) / 60,
      ),
      estimated: false,
    };
  }

  staticMapUrl(options: StaticMapOptions): string | null {
    if (!this.browserKey) return null;
    const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
    url.searchParams.set('center', `${options.center.lat},${options.center.lng}`);
    url.searchParams.set('zoom', String(options.zoom ?? 14));
    url.searchParams.set('size', `${options.width ?? 640}x${options.height ?? 360}`);
    url.searchParams.set('scale', '2');
    url.searchParams.set('language', 'iw');
    for (const marker of options.markers ?? []) {
      url.searchParams.append(
        'markers',
        `color:${marker.color ?? 'blue'}|label:${marker.label ?? ''}|${marker.position.lat},${marker.position.lng}`,
      );
    }
    url.searchParams.set('key', this.browserKey);
    return url.toString();
  }

  navigationUrl(to: LatLng, label?: string): string {
    const destination = label ? encodeURIComponent(label) : `${to.lat},${to.lng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&destination_place_id=`;
  }
}
