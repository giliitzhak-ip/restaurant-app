import { estimateEtaMinutes, haversineKm, type LatLng } from '@/lib/utils/geo';
import type { GeocodeResult, MapsAdapter, RouteEstimate } from './types';

/**
 * Offline maps adapter. Geocoding resolves against a small table of Israeli
 * cities plus a deterministic hash-based jitter, so the same address always
 * yields the same coordinates — which keeps seeded demo data stable.
 */
const CITIES: Array<{ names: string[]; location: LatLng }> = [
  { names: ['תל אביב', 'tel aviv', 'תל-אביב'], location: { lat: 32.0853, lng: 34.7818 } },
  { names: ['ירושלים', 'jerusalem'], location: { lat: 31.7683, lng: 35.2137 } },
  { names: ['חיפה', 'haifa'], location: { lat: 32.794, lng: 34.9896 } },
  { names: ['באר שבע', 'beer sheva'], location: { lat: 31.2518, lng: 34.7913 } },
  { names: ['ראשון לציון', 'rishon'], location: { lat: 31.9730, lng: 34.7925 } },
  { names: ['פתח תקווה', 'petah tikva'], location: { lat: 32.0878, lng: 34.8878 } },
  { names: ['נתניה', 'netanya'], location: { lat: 32.3215, lng: 34.8532 } },
  { names: ['אשדוד', 'ashdod'], location: { lat: 31.8044, lng: 34.6553 } },
  { names: ['הרצליה', 'herzliya'], location: { lat: 32.1624, lng: 34.8447 } },
  { names: ['רמת גן', 'ramat gan'], location: { lat: 32.0684, lng: 34.8248 } },
  { names: ['חולון', 'holon'], location: { lat: 32.0117, lng: 34.7725 } },
  { names: ['מודיעין', 'modiin'], location: { lat: 31.8928, lng: 35.0104 } },
  { names: ['אילת', 'eilat'], location: { lat: 29.5577, lng: 34.9519 } },
];

const DEFAULT_CENTER: LatLng = { lat: 32.0853, lng: 34.7818 };

function hash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) % 100000;
  }
  return value;
}

export class MockMapsAdapter implements MapsAdapter {
  readonly name = 'mock' as const;
  readonly isLive = false;

  async geocode(address: string): Promise<GeocodeResult[]> {
    const needle = address.toLowerCase();
    const city = CITIES.find((entry) => entry.names.some((name) => needle.includes(name.toLowerCase())));
    const base = city?.location ?? DEFAULT_CENTER;
    const seed = hash(address);
    // ±~1.5 km of deterministic jitter so distinct addresses are distinct points.
    const location = {
      lat: base.lat + ((seed % 300) - 150) / 10000,
      lng: base.lng + (((seed >> 3) % 300) - 150) / 10000,
    };
    return [
      {
        address,
        location,
        city: city?.names[0] ?? null,
        postalCode: null,
        confidence: city ? 0.7 : 0.3,
      },
    ];
  }

  async reverseGeocode(location: LatLng): Promise<GeocodeResult | null> {
    const nearest = CITIES.map((city) => ({
      city,
      distance: haversineKm(location, city.location),
    })).sort((a, b) => a.distance - b.distance)[0];

    return {
      address: `${nearest.city.names[0]} (מיקום משוער)`,
      location,
      city: nearest.city.names[0],
      postalCode: null,
      confidence: 0.3,
    };
  }

  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    const straight = haversineKm(from, to);
    // City streets are rarely straight lines; 1.3 is a reasonable detour factor.
    const distanceKm = Math.round(straight * 1.3 * 100) / 100;
    return { distanceKm, durationMinutes: estimateEtaMinutes(distanceKm), estimated: true };
  }

  staticMapUrl(): string | null {
    // No image provider offline — the Map component renders a schematic instead.
    return null;
  }

  navigationUrl(to: LatLng, label?: string): string {
    const query = label ? encodeURIComponent(label) : `${to.lat},${to.lng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&destination_place_id=&query=${query}`;
  }
}
