import type { EtaResult, LatLng, RouteResult } from './types';

/**
 * Vendor-neutral routing boundary (spec §12).
 *
 * Nothing above this interface knows which engine answered. Swapping vendor
 * means adding one implementation, not touching the matching engine.
 */
export interface MapProvider {
  readonly name: string;

  /** Road route between two points. */
  getRoute(from: LatLng, to: LatLng): Promise<RouteResult>;

  /** Travel time only. */
  getETA(from: LatLng, to: LatLng): Promise<EtaResult>;

  /** Distance in km. Straight-line implementations must say so via confidence. */
  calculateDistance(from: LatLng, to: LatLng): Promise<RouteResult>;

  /**
   * Extra cost of inserting a stop at `waypoint` on a trip from `from` to
   * `to`, i.e. route(from→waypoint→to) − route(from→to).
   *
   * This is the primitive behind ROUTE OPPORTUNITY (spec §11).
   */
  calculateRouteDeviation(
    from: LatLng,
    waypoint: LatLng,
    to: LatLng,
  ): Promise<RouteDeviation>;
}

export interface RouteDeviation {
  readonly deviationMinutes: number;
  readonly deviationKm: number;
  readonly directMinutes: number;
  readonly viaMinutes: number;
  readonly confidence: RouteResult['confidence'];
}
