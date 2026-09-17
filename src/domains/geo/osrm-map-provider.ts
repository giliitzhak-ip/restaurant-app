import { MapProvider, type RouteDeviation } from './map-provider';
import { EstimateMapProvider } from './estimate-map-provider';
import { round } from './math';
import type { EtaResult, LatLng, RouteResult } from './types';

interface OsrmRoute {
  distance: number; // metres
  duration: number; // seconds
  geometry?: string;
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
}

/**
 * Real road routing via an OSRM HTTP server (spec §12).
 *
 * Failure behaviour is deliberate (spec §44 "Routing API unavailable —
 * fallback safely; do not invent an accurate ETA"): on timeout or error it
 * falls back to the geometric estimator and the result stays marked
 * `estimated`, so callers can tell a measured ETA from an approximated one.
 */
export class OsrmMapProvider implements MapProvider {
  readonly name = 'osrm';
  private readonly fallback = new EstimateMapProvider();

  constructor(
    private readonly baseUrl = process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org',
    private readonly timeoutMs = 2500,
  ) {}

  private async request(coordinates: LatLng[]): Promise<OsrmRoute | null> {
    const path = coordinates.map((c) => `${c.lon},${c.lat}`).join(';');
    const url = `${this.baseUrl}/route/v1/driving/${path}?overview=false&alternatives=false&steps=false`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const body = (await response.json()) as OsrmResponse;
      if (body.code !== 'Ok' || !body.routes?.length) return null;
      return body.routes[0] ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private static toRouteResult(route: OsrmRoute): RouteResult {
    return {
      distanceKm: round(route.distance / 1000, 3),
      durationMinutes: round(route.duration / 60, 2),
      confidence: 'routed',
      geometry: route.geometry,
    };
  }

  async getRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
    const route = await this.request([from, to]);
    return route ? OsrmMapProvider.toRouteResult(route) : this.fallback.getRoute(from, to);
  }

  async calculateDistance(from: LatLng, to: LatLng): Promise<RouteResult> {
    return this.getRoute(from, to);
  }

  async getETA(from: LatLng, to: LatLng): Promise<EtaResult> {
    const route = await this.getRoute(from, to);
    return { minutes: route.durationMinutes, confidence: route.confidence };
  }

  async calculateRouteDeviation(
    from: LatLng,
    waypoint: LatLng,
    to: LatLng,
  ): Promise<RouteDeviation> {
    const [direct, via] = await Promise.all([
      this.request([from, to]),
      this.request([from, waypoint, to]),
    ]);

    if (!direct || !via) {
      return this.fallback.calculateRouteDeviation(from, waypoint, to);
    }

    const directMinutes = direct.duration / 60;
    const viaMinutes = via.duration / 60;
    return {
      deviationMinutes: round(Math.max(0, viaMinutes - directMinutes), 2),
      deviationKm: round(Math.max(0, (via.distance - direct.distance) / 1000), 3),
      directMinutes: round(directMinutes, 2),
      viaMinutes: round(viaMinutes, 2),
      confidence: 'routed',
    };
  }
}
