import type { MapProvider } from '@/domains/geo';
import { angularDifferenceDeg, bearingDeg, clamp, haversineKm, round, scaleLinear } from '@/domains/geo/math';
import type { LatLng, RouteConfidence } from '@/domains/geo';

/**
 * What the calculation was actually based on. Exposed because the three
 * bases are NOT equally trustworthy and the product must not pretend they
 * are (spec §53).
 *
 * - `destination_route` — the provider has a known destination, so the real
 *   extra cost of inserting this job was measured. Strongest evidence.
 * - `heading`           — no destination, but the device reported a heading,
 *   so alignment with the customer's direction is inferred. Weaker.
 * - `proximity_only`    — neither signal available (e.g. a stationary
 *   provider). Not a route judgement at all; `isOnTheWay` is always false.
 */
export type RouteOpportunityBasis = 'destination_route' | 'heading' | 'proximity_only';

/** The output shape required by spec §11, plus provenance. */
export interface RouteOpportunity {
  readonly isOnTheWay: boolean;
  readonly routeDeviationMinutes: number;
  readonly routeDeviationDistance: number;
  readonly opportunityScore: number;

  readonly basis: RouteOpportunityBasis;
  readonly confidence: RouteConfidence;
  /** Road distance provider → customer. */
  readonly approachKm: number;
  /** Angle between heading and the direction to the customer, when known. */
  readonly headingOffsetDeg: number | null;
}

export interface RouteOpportunityInput {
  readonly providerLocation: LatLng;
  readonly customerLocation: LatLng;
  /** Degrees clockwise from north, or null when the device cannot report it. */
  readonly providerHeadingDeg: number | null;
  /** Where the provider is currently going, when known. */
  readonly providerDestination: LatLng | null;
  /** Ignore heading below this speed: a parked device's heading is noise. */
  readonly providerSpeedKmh?: number | null;
}

export interface RouteOpportunityConfig {
  /** A detour at or below this many minutes counts as "already on the way". */
  readonly onTheWayDeviationMinutes: number;
  /** Deviation at which the opportunity score reaches zero. */
  readonly maxDeviationMinutes: number;
  /**
   * Lowest score a genuinely on-the-way provider can receive, and the
   * highest a diverting one can.
   *
   * The deliberate GAP between these two encodes a qualitative difference:
   * "already passing your street" and "has to turn around" are not points on
   * one smooth line. Without the gap, `isOnTheWay` would flip at the
   * threshold while the score moved by almost nothing, which makes the
   * threshold cosmetic and lets small price or rating edges quietly outvote
   * the product's primary signal (spec §11, §15).
   */
  readonly onTheWayScoreFloor: number;
  readonly divertedScoreCeiling: number;
  /** Heading within this angle of the customer counts as travelling toward. */
  readonly headingTowardDeg: number;
  /** Below this speed, a reported heading is not meaningful. */
  readonly minSpeedForHeadingKmh: number;
  /**
   * Ceiling for heading-only evidence. Inference must not outrank a measured
   * route, so a heading-based match can never score as high as a confirmed
   * low-deviation one.
   */
  readonly headingBasisScoreCeiling: number;
  /** Distance beyond which proximity alone stops earning any credit. */
  readonly proximityHorizonKm: number;
}

export const DEFAULT_ROUTE_OPPORTUNITY_CONFIG: RouteOpportunityConfig = {
  onTheWayDeviationMinutes: 6,
  maxDeviationMinutes: 25,
  onTheWayScoreFloor: 85,
  divertedScoreCeiling: 70,
  headingTowardDeg: 50,
  minSpeedForHeadingKmh: 8,
  headingBasisScoreCeiling: 78,
  proximityHorizonKm: 18,
};

/**
 * ROUTE OPPORTUNITY (spec §11) — the core differentiator.
 *
 * Answers "who is already going there?" rather than "who is closest?".
 * Straight-line distance is never the only signal (spec §11, final line):
 * every branch either measures a real route deviation or explicitly reports
 * that it could not.
 */
export class RouteOpportunityCalculator {
  constructor(
    private readonly maps: MapProvider,
    private readonly config: RouteOpportunityConfig = DEFAULT_ROUTE_OPPORTUNITY_CONFIG,
  ) {}

  async calculate(input: RouteOpportunityInput): Promise<RouteOpportunity> {
    const { providerLocation, customerLocation, providerDestination } = input;

    const approach = await this.maps.getRoute(providerLocation, customerLocation);
    const approachKm = approach.distanceKm;

    const headingOffsetDeg = this.resolveHeadingOffset(input);

    // ── Strongest case: we know where they are going, so measure the detour.
    if (providerDestination) {
      const deviation = await this.maps.calculateRouteDeviation(
        providerLocation,
        customerLocation,
        providerDestination,
      );

      const isOnTheWay = deviation.deviationMinutes <= this.config.onTheWayDeviationMinutes;

      // Piecewise on purpose — see onTheWayScoreFloor. Inside the on-the-way
      // band the score stays high; past it, it falls from a distinctly lower
      // ceiling toward zero.
      const opportunityScore = round(
        isOnTheWay
          ? scaleLinear(
              deviation.deviationMinutes,
              0,
              this.config.onTheWayDeviationMinutes,
              100,
              this.config.onTheWayScoreFloor,
            )
          : scaleLinear(
              deviation.deviationMinutes,
              this.config.onTheWayDeviationMinutes,
              this.config.maxDeviationMinutes,
              this.config.divertedScoreCeiling,
              0,
            ),
        2,
      );

      return {
        isOnTheWay,
        routeDeviationMinutes: deviation.deviationMinutes,
        routeDeviationDistance: deviation.deviationKm,
        opportunityScore,
        basis: 'destination_route',
        confidence: deviation.confidence,
        approachKm,
        headingOffsetDeg,
      };
    }

    // ── Middle case: heading only. Infer, and cap the score accordingly.
    if (headingOffsetDeg !== null) {
      const alignment = clamp(1 - headingOffsetDeg / 180, 0, 1);
      const isTravellingToward = headingOffsetDeg <= this.config.headingTowardDeg;

      // Treat the misalignment as an implied detour: driving straight at the
      // customer implies none, driving away implies doubling back.
      const impliedDeviationMinutes = round(
        (approach.durationMinutes * (headingOffsetDeg / 180)) * 2,
        2,
      );

      const proximityCredit = scaleLinear(approachKm, 0, this.config.proximityHorizonKm, 1, 0);
      const raw = 100 * (0.7 * alignment + 0.3 * proximityCredit);

      return {
        isOnTheWay:
          isTravellingToward && impliedDeviationMinutes <= this.config.onTheWayDeviationMinutes,
        routeDeviationMinutes: impliedDeviationMinutes,
        routeDeviationDistance: round(
          Math.max(0, approachKm * (headingOffsetDeg / 180) * 2),
          3,
        ),
        opportunityScore: round(Math.min(raw, this.config.headingBasisScoreCeiling), 2),
        basis: 'heading',
        confidence: approach.confidence,
        approachKm,
        headingOffsetDeg,
      };
    }

    // ── Weakest case: no direction information at all. Say so.
    const proximityCredit = scaleLinear(approachKm, 0, this.config.proximityHorizonKm, 1, 0);
    return {
      isOnTheWay: false,
      routeDeviationMinutes: 0,
      routeDeviationDistance: 0,
      // Deliberately modest: proximity is not a route opportunity. Capped
      // well below the heading tier so a directional signal always wins.
      opportunityScore: round(45 * proximityCredit, 2),
      basis: 'proximity_only',
      confidence: approach.confidence,
      approachKm,
      headingOffsetDeg: null,
    };
  }

  /**
   * The angle between where the provider is pointing and where the customer
   * is. Returns null when heading is absent or untrustworthy — a parked van's
   * compass reading must not be treated as a direction of travel (spec §44).
   */
  private resolveHeadingOffset(input: RouteOpportunityInput): number | null {
    const { providerHeadingDeg, providerSpeedKmh, providerLocation, customerLocation } = input;
    if (providerHeadingDeg === null || providerHeadingDeg === undefined) return null;
    if (
      providerSpeedKmh !== null &&
      providerSpeedKmh !== undefined &&
      providerSpeedKmh < this.config.minSpeedForHeadingKmh
    ) {
      return null;
    }
    if (haversineKm(providerLocation, customerLocation) < 0.05) return 0;

    const bearingToCustomer = bearingDeg(providerLocation, customerLocation);
    return round(angularDifferenceDeg(providerHeadingDeg, bearingToCustomer), 2);
  }
}
