import { MapProvider, type RouteDeviation } from './map-provider';
import { haversineKm, round } from './math';
import type { EtaResult, LatLng, RouteResult } from './types';

/**
 * Geometric approximation used when no routing engine is configured or
 * reachable.
 *
 * IMPORTANT — this is NOT routing. It multiplies great-circle distance by a
 * road-winding factor and divides by an assumed urban speed. Every figure it
 * returns is marked `estimated`, and the product surfaces those as
 * approximate rather than as a promise (spec §44: "Do not invent an accurate
 * ETA").
 *
 * It is deterministic, which also makes it the right provider for tests and
 * the matching lab.
 */
export class EstimateMapProvider implements MapProvider {
  readonly name = 'estimate';

  constructor(
    /** Ratio of real road distance to straight-line distance. */
    private readonly roadFactor = 1.35,
    /** Assumed average speed in km/h for dense urban driving. */
    private readonly averageSpeedKmh = 26,
    /** Fixed overhead for parking, finding the door, etc. */
    private readonly fixedOverheadMinutes = 3,
  ) {}

  /** Approximate road distance in km. */
  private roadKm(from: LatLng, to: LatLng): number {
    return haversineKm(from, to) * this.roadFactor;
  }

  /**
   * Driving time only, with no arrival overhead.
   *
   * Route DEVIATION must be measured from travel time alone. Including the
   * per-stop overhead here would make a provider passing straight through
   * the customer's street look like a 3-minute detour, purely because the
   * trip was split into two legs.
   */
  private travelMinutes(from: LatLng, to: LatLng): number {
    return (this.roadKm(from, to) / this.averageSpeedKmh) * 60;
  }

  private estimate(from: LatLng, to: LatLng): RouteResult {
    return {
      distanceKm: round(this.roadKm(from, to), 3),
      // An ETA a customer waits on does include the overhead of arriving.
      durationMinutes: round(this.travelMinutes(from, to) + this.fixedOverheadMinutes, 2),
      confidence: 'estimated',
    };
  }

  async getRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
    return this.estimate(from, to);
  }

  async calculateDistance(from: LatLng, to: LatLng): Promise<RouteResult> {
    return this.estimate(from, to);
  }

  async getETA(from: LatLng, to: LatLng): Promise<EtaResult> {
    const route = this.estimate(from, to);
    return { minutes: route.durationMinutes, confidence: route.confidence };
  }

  async calculateRouteDeviation(
    from: LatLng,
    waypoint: LatLng,
    to: LatLng,
  ): Promise<RouteDeviation> {
    // Travel-time only on both sides, so the comparison is apples to apples.
    const directMinutes = this.travelMinutes(from, to);
    const viaMinutes =
      this.travelMinutes(from, waypoint) + this.travelMinutes(waypoint, to);
    const directKm = this.roadKm(from, to);
    const viaKm = this.roadKm(from, waypoint) + this.roadKm(waypoint, to);

    return {
      deviationMinutes: round(Math.max(0, viaMinutes - directMinutes), 2),
      deviationKm: round(Math.max(0, viaKm - directKm), 3),
      directMinutes: round(directMinutes, 2),
      viaMinutes: round(viaMinutes, 2),
      confidence: 'estimated',
    };
  }
}
