import type { MapProvider } from '@/domains/geo';
import { round } from '@/domains/geo/math';
import {
  DEFAULT_MATCHING_THRESHOLDS,
  DEFAULT_MATCHING_WEIGHTS,
  type MatchingThresholds,
  type MatchingWeights,
} from './config';
import {
  DEFAULT_ROUTE_OPPORTUNITY_CONFIG,
  RouteOpportunityCalculator,
  type RouteOpportunityConfig,
} from './route-opportunity';
import {
  scoreAvailability,
  scoreEta,
  scoreExperience,
  scorePrice,
  scoreRating,
  scoreReliability,
  scoreSkillMatch,
  type SignalScore,
} from './scorers';
import type {
  ExcludedCandidate,
  MatchRequest,
  MatchResult,
  ProviderCandidate,
  ScoreBreakdown,
  ScoreComponent,
  ScoredCandidate,
} from './types';

export interface MatchingEngineOptions {
  readonly weights?: MatchingWeights;
  readonly thresholds?: MatchingThresholds;
  readonly routeOpportunity?: RouteOpportunityConfig;
}

/**
 * MatchingEngine (spec §13).
 *
 * Pipeline:
 *   CandidateFinder (SQL, upstream)
 *     → SkillMatcher → AvailabilityMatcher → GeoFilter
 *     → RouteOpportunityCalculator → ETACalculator
 *     → Reliability / Rating / Price / Experience scorers
 *     → RankingEngine
 *
 * Deliberately NOT optimising for closest, cheapest or highest-rated
 * (spec §15) — it optimises for the best opportunity for a successful
 * completion, of which "who is already going there" is the strongest single
 * signal.
 *
 * This class performs no database access and imports nothing from React, so
 * it is fully unit-testable and cannot leak into the UI layer.
 */
export class MatchingEngine {
  private readonly weights: MatchingWeights;
  private readonly thresholds: MatchingThresholds;
  private readonly routeCalculator: RouteOpportunityCalculator;

  constructor(
    private readonly maps: MapProvider,
    options: MatchingEngineOptions = {},
  ) {
    this.weights = options.weights ?? DEFAULT_MATCHING_WEIGHTS;
    this.thresholds = options.thresholds ?? DEFAULT_MATCHING_THRESHOLDS;
    this.routeCalculator = new RouteOpportunityCalculator(
      maps,
      options.routeOpportunity ?? DEFAULT_ROUTE_OPPORTUNITY_CONFIG,
    );
  }

  async match(
    candidates: readonly ProviderCandidate[],
    request: MatchRequest,
  ): Promise<MatchResult> {
    const excluded: ExcludedCandidate[] = [];
    const eligible: ProviderCandidate[] = [];

    // ── Hard filters. These are eligibility, not preference: a candidate
    // failing one must never be ranked, however attractive otherwise.
    for (const candidate of candidates) {
      const reason = this.disqualify(candidate);
      if (reason) excluded.push({ candidate, reason });
      else eligible.push(candidate);
    }

    const scored = await Promise.all(
      eligible.map((candidate) => this.scoreCandidate(candidate, request)),
    );

    // ── RankingEngine. Ties break toward the provider already on the way,
    // then toward the sooner arrival: both favour successful completion.
    const ranked = [...scored].sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (a.routeOpportunity.isOnTheWay !== b.routeOpportunity.isOnTheWay) {
        return a.routeOpportunity.isOnTheWay ? -1 : 1;
      }
      return (a.etaMinutes ?? Infinity) - (b.etaMinutes ?? Infinity);
    });

    return {
      ranked,
      excluded,
      weightsUsed: this.weights,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /** GeoFilter + availability gate. Returns a reason, or null if eligible. */
  private disqualify(candidate: ProviderCandidate): string | null {
    if (candidate.state !== 'ONLINE') {
      return `provider_state_${candidate.state.toLowerCase()}`;
    }
    // A stale fix is never treated as live (spec §18).
    if (candidate.locationAgeSeconds > this.thresholds.maxLocationAgeSeconds) {
      return 'location_stale';
    }
    // A very imprecise fix cannot support a route judgement (spec §44).
    if (
      candidate.accuracyM !== null &&
      candidate.accuracyM > this.thresholds.maxLocationAccuracyMeters
    ) {
      return 'location_inaccurate';
    }
    if (candidate.straightDistanceKm > candidate.maxRadiusKm) {
      return 'outside_provider_radius';
    }
    return null;
  }

  private async scoreCandidate(
    candidate: ProviderCandidate,
    request: MatchRequest,
  ): Promise<ScoredCandidate> {
    const routeOpportunity = await this.routeCalculator.calculate({
      providerLocation: candidate.location,
      customerLocation: request.customerLocation,
      providerHeadingDeg: candidate.headingDeg,
      providerDestination: candidate.destination,
      providerSpeedKmh: candidate.speedKmh,
    });

    const approach = await this.maps.getRoute(candidate.location, request.customerLocation);
    const etaMinutes = approach.confidence === 'unavailable' ? null : approach.durationMinutes;

    const signals: Record<keyof ScoreBreakdown, SignalScore> = {
      routeOpportunity: {
        score: routeOpportunity.opportunityScore,
        reason: this.describeRouteOpportunity(routeOpportunity),
      },
      skillMatch: scoreSkillMatch(candidate, request),
      availability: scoreAvailability(candidate, this.thresholds.maxLocationAgeSeconds),
      eta: scoreEta(etaMinutes),
      reliability: scoreReliability(candidate),
      rating: scoreRating(candidate),
      price: scorePrice(candidate, request.referencePriceIls),
      experience: scoreExperience(candidate),
    };

    const breakdown = this.buildBreakdown(signals);
    const finalScore = round(
      Object.values(breakdown).reduce((sum, c) => sum + c.weighted, 0),
      2,
    );

    return {
      candidate,
      finalScore,
      breakdown,
      routeOpportunity,
      etaMinutes: etaMinutes === null ? null : round(etaMinutes, 1),
      etaConfidence: approach.confidence,
      routeDistanceKm: approach.distanceKm,
      priceIls: candidate.priceIls ?? request.referencePriceIls ?? 0,
      weightsUsed: this.weights,
    };
  }

  private buildBreakdown(signals: Record<keyof ScoreBreakdown, SignalScore>): ScoreBreakdown {
    const component = (key: keyof ScoreBreakdown): ScoreComponent => {
      const signal = signals[key];
      const weight = this.weights[key];
      return {
        score: signal.score,
        weight,
        weighted: round(signal.score * weight, 3),
        reason: signal.reason,
      };
    };

    return {
      routeOpportunity: component('routeOpportunity'),
      skillMatch: component('skillMatch'),
      availability: component('availability'),
      eta: component('eta'),
      reliability: component('reliability'),
      rating: component('rating'),
      price: component('price'),
      experience: component('experience'),
    };
  }

  private describeRouteOpportunity(
    opportunity: Awaited<ReturnType<RouteOpportunityCalculator['calculate']>>,
  ): string {
    switch (opportunity.basis) {
      case 'destination_route':
        return opportunity.isOnTheWay
          ? `כבר בדרך לאזור — סטייה של ${opportunity.routeDeviationMinutes} דקות בלבד`
          : `סטייה מהמסלול: ${opportunity.routeDeviationMinutes} דקות`;
      case 'heading':
        return opportunity.isOnTheWay
          ? `נוסע בכיוון הלקוח (הפרש ${opportunity.headingOffsetDeg}°)`
          : `כיוון נסיעה שונה (הפרש ${opportunity.headingOffsetDeg}°)`;
      case 'proximity_only':
        return `אין נתוני כיוון — לפי מרחק בלבד (${opportunity.approachKm} ק"מ)`;
    }
  }
}
