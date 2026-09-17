import { EstimateMapProvider } from './estimate-map-provider';
import { OsrmMapProvider } from './osrm-map-provider';
import type { MapProvider } from './map-provider';

export type { MapProvider, RouteDeviation } from './map-provider';
export type { LatLng, RouteResult, EtaResult, RouteConfidence } from './types';
export { RoutingUnavailableError } from './types';
export { EstimateMapProvider } from './estimate-map-provider';
export { OsrmMapProvider } from './osrm-map-provider';
export * from './math';

let cached: MapProvider | null = null;

/**
 * Resolve the configured routing engine (spec §12).
 * `MAP_PROVIDER=osrm` uses real road routing; anything else uses the
 * documented geometric approximation.
 */
export function getMapProvider(): MapProvider {
  if (cached) return cached;
  cached = process.env.MAP_PROVIDER === 'osrm' ? new OsrmMapProvider() : new EstimateMapProvider();
  return cached;
}

/** Test seam. */
export function setMapProvider(provider: MapProvider | null): void {
  cached = provider;
}
