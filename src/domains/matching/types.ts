import type { LatLng, RouteConfidence } from '@/domains/geo';
import type { RouteOpportunity } from './route-opportunity';
import type { MatchingWeights } from './config';

/** A provider considered for a job, as returned by CandidateFinder. */
export interface ProviderCandidate {
  readonly providerId: string;
  readonly fullName: string;
  readonly businessName: string | null;
  readonly state: 'OFFLINE' | 'ONLINE' | 'BUSY';

  readonly location: LatLng;
  readonly headingDeg: number | null;
  readonly speedKmh: number | null;
  readonly accuracyM: number | null;
  readonly locationAgeSeconds: number;
  readonly destination: LatLng | null;
  /**
   * True when `location` is a live GPS fix. False when it is the centre of the
   * provider's declared service area, used as a fallback for a scheduled job
   * where the provider is not currently reporting.
   *
   * Route opportunity is only meaningful on a live fix, so the calculator
   * refuses to infer direction when this is false (spec §29, §70).
   */
  readonly locationIsLive: boolean;

  /** Skills the provider holds in the job's category. */
  readonly skills: readonly string[];
  /** The provider's own price for the requested service, in shekels. */
  readonly priceIls: number | null;

  readonly ratingAvg: number | null;
  readonly ratingCount: number;
  readonly completedJobs: number;
  readonly cancelledJobs: number;
  readonly offersReceived: number;
  readonly offersAccepted: number;
  readonly avgResponseSeconds: number | null;
  readonly yearsExperience: number;
  readonly maxRadiusKm: number;
  readonly inServiceArea: boolean;
  readonly straightDistanceKm: number;
}

/** What the job asks for. */
export interface MatchRequest {
  readonly jobId: string;
  readonly customerLocation: LatLng;
  readonly locationAccuracyM: number | null;
  readonly categorySlug: string;
  readonly serviceSlug: string | null;
  readonly requiredSkills: readonly string[];
  readonly urgency: 'low' | 'normal' | 'high' | 'emergency';
  /** Guide price for the service, used to score how a provider's price compares. */
  readonly referencePriceIls: number | null;
}

export interface ScoreComponent {
  readonly score: number;
  readonly weight: number;
  readonly weighted: number;
  readonly reason: string;
}

/** Per-signal breakdown, surfaced only to admin/dev tools (spec §34). */
export interface ScoreBreakdown {
  readonly routeOpportunity: ScoreComponent;
  readonly skillMatch: ScoreComponent;
  readonly availability: ScoreComponent;
  readonly eta: ScoreComponent;
  readonly reliability: ScoreComponent;
  readonly rating: ScoreComponent;
  readonly price: ScoreComponent;
  readonly experience: ScoreComponent;
}

export interface ScoredCandidate {
  readonly candidate: ProviderCandidate;
  readonly finalScore: number;
  readonly breakdown: ScoreBreakdown;
  readonly routeOpportunity: RouteOpportunity;
  readonly etaMinutes: number | null;
  readonly etaConfidence: RouteConfidence;
  readonly routeDistanceKm: number;
  readonly priceIls: number;
  readonly weightsUsed: MatchingWeights;
}

/** A candidate removed before scoring, with the reason (for telemetry §36). */
export interface ExcludedCandidate {
  readonly candidate: ProviderCandidate;
  readonly reason: string;
}

export interface MatchResult {
  readonly ranked: readonly ScoredCandidate[];
  readonly excluded: readonly ExcludedCandidate[];
  readonly weightsUsed: MatchingWeights;
  readonly evaluatedAt: string;
}
