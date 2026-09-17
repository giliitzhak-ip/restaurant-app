/** A WGS84 coordinate. */
export interface LatLng {
  readonly lat: number;
  readonly lon: number;
}

/**
 * How much to trust a duration/distance figure.
 *
 * - `routed`      — produced by a real routing engine following roads.
 * - `estimated`   — produced by a geometric approximation. Usable for
 *                   ranking, NOT safe to present as a precise promise.
 * - `unavailable` — routing failed and no number could be produced. The
 *                   product must say so rather than invent one (spec §44).
 */
export type RouteConfidence = 'routed' | 'estimated' | 'unavailable';

export interface RouteResult {
  readonly distanceKm: number;
  readonly durationMinutes: number;
  readonly confidence: RouteConfidence;
  /** Encoded geometry when the provider supplies one. */
  readonly geometry?: string;
}

export interface EtaResult {
  readonly minutes: number | null;
  readonly confidence: RouteConfidence;
}

export class RoutingUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RoutingUnavailableError';
  }
}
