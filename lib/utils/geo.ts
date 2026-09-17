export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres. PostGIS does this in the database for
 * discovery; this is the in-process equivalent used for scoring, the mock
 * maps adapter and tests.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(point: Partial<LatLng> | null | undefined): point is LatLng {
  return (
    !!point &&
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

/** Rough urban ETA. Real ETAs come from the maps provider when configured. */
export function estimateEtaMinutes(distanceKm: number, averageSpeedKmh = 28): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  return Math.max(3, Math.round((distanceKm / averageSpeedKmh) * 60) + 4);
}

/** Bounding box around a point, used to frame a static map image. */
export function boundsAround(center: LatLng, radiusKm: number) {
  const latDelta = radiusKm / 110.574;
  const lngDelta = radiusKm / (111.32 * Math.cos(toRadians(center.lat)) || 1);
  return {
    north: center.lat + latDelta,
    south: center.lat - latDelta,
    east: center.lng + lngDelta,
    west: center.lng - lngDelta,
  };
}
